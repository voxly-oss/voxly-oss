"""Notifications for the client chat (Web Push): which devices may subscribe,
when a push goes out, what it carries, and how subscriptions end.

No test reaches a push service: conftest replaces the sender, and the
end-to-end tests here intercept the HTTP call itself and decrypt it."""
import base64
import contextlib
import io
import json
import os
import uuid

import aiohttp
import http_ece
import jwt
import pytest
import pywebpush
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from py_vapid import Vapid

from app.models.client import Client
from app.models.portal_push_subscription import PortalPushSubscription
from app.services import portal_push
from scripts import generate_vapid_key
from tests.test_portal import _agency_and_client, _ai, _bearer, _create_link, _open, _pipeline_patches
from tests.test_realtime import _auth_headers

FCM = "https://fcm.googleapis.com/fcm/send/"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class Device:
    """A browser's push subscription, with the private half kept so a test can
    decrypt what the server sent it."""

    def __init__(self, endpoint: str):
        self.endpoint = endpoint
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.auth_secret = os.urandom(16)
        public = self.key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        self.json = {"endpoint": endpoint, "expirationTime": None, "keys": {"p256dh": _b64(public), "auth": _b64(self.auth_secret)}}

    def decrypt(self, body: bytes) -> dict:
        return json.loads(http_ece.decrypt(body, private_key=self.key, auth_secret=self.auth_secret, version="aes128gcm"))


@pytest.fixture
def vapid(monkeypatch) -> Vapid:
    """Push on, with a throwaway key."""
    key = Vapid()
    key.generate_keys()
    monkeypatch.setattr(portal_push, "_vapid", lambda: key)
    return key


@pytest.fixture
def push_service(monkeypatch):
    """The real pywebpush sender, with the HTTP POST intercepted: records each
    request and answers with the status set for its endpoint (default 201)."""
    requests, answers = [], {}

    class _Response:
        def __init__(self, status):
            self.status, self.reason = status, "test"

        async def text(self):
            return ""

    async def _post(self, url, **kwargs):
        headers = {k.lower(): v for k, v in kwargs["headers"].items()}
        requests.append({"url": url, "headers": headers, "data": kwargs["data"]})
        return _Response(answers.get(url, 201))

    monkeypatch.setattr(portal_push, "webpush_async", pywebpush.webpush_async)
    monkeypatch.setattr(aiohttp.ClientSession, "post", _post)
    return requests, answers


@pytest.fixture
def pushed(monkeypatch) -> list:
    """Just record what the Voxly channel asks to push."""
    calls = []
    monkeypatch.setattr(portal_push, "notify_in_background", lambda client_id, text: calls.append((str(client_id), text)))
    return calls


def _linked_client(client: TestClient, email: str, phone: str) -> tuple[str, str, str]:
    agency, client_id = _agency_and_client(client, email, phone)
    session = _open(client, _create_link(client, agency, client_id)["url"])
    return agency, client_id, session


def _subscribe(client: TestClient, session: str, device: Device):
    return client.post("/api/v1/portal/push/subscriptions", json=device.json, headers=_bearer(session))


def _devices(client: TestClient, agency: str, client_id: str) -> int:
    return client.get(f"/api/v1/clients/{client_id}/chat-link", headers=_auth_headers(agency)).json()["notification_devices"]


# ── Configuration ────────────────────────────────────────────────────────────


def test_notifications_stay_off_without_a_vapid_key(client: TestClient):
    _, _, session = _linked_client(client, "push_off@test.com", "+911810000001")
    assert client.get("/api/v1/portal/push", headers=_bearer(session)).json() == {"enabled": False, "public_key": None}
    assert _subscribe(client, session, Device(FCM + "off")).status_code == 409
    assert client.get("/api/v1/portal/push").status_code == 401  # a client session is required


def test_the_chat_gets_the_key_to_subscribe_with(client: TestClient, vapid: Vapid):
    _, _, session = _linked_client(client, "push_config@test.com", "+911810000002")
    config = client.get("/api/v1/portal/push", headers=_bearer(session)).json()
    expected = vapid.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    assert config == {"enabled": True, "public_key": _b64(expected)}


def test_the_generated_key_works_as_the_server_key(monkeypatch):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        generate_vapid_key.main()
    lines = out.getvalue().splitlines()
    private = lines[0].removeprefix("VAPID_PRIVATE_KEY=")
    printed_public = lines[1].rsplit(" ", 1)[1]
    monkeypatch.setattr(portal_push, "_vapid", lambda: Vapid.from_string(private_key=private))
    assert portal_push.public_key() == printed_public
    assert len(base64.urlsafe_b64decode(printed_public + "=")) == 65


# ── Subscribing ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize("endpoint, allowed", [
    (FCM + "abc", True),
    ("https://updates.push.services.mozilla.com/wpush/v2/abc", True),
    ("https://web.push.apple.com/QH-abc", True),
    ("https://wns2-par02p.notify.windows.com/w/?token=abc", True),
    ("http://fcm.googleapis.com/fcm/send/abc", False),             # not https
    ("https://fcm.googleapis.com:8443/fcm/send/abc", False),       # odd port
    ("https://user:pw@fcm.googleapis.com/fcm/send/abc", False),    # credentials
    ("https://fcm.googleapis.com.evil.test/abc", False),           # lookalike host
    ("https://notify.windows.com.evil.test/abc", False),
    ("https://localhost/abc", False),
    ("https://169.254.169.254/latest/meta-data", False),
    ("not a url", False),
])
def test_only_real_push_services_are_accepted(endpoint, allowed):
    assert portal_push.push_endpoint_allowed(endpoint) is allowed


def test_subscribing_validates_and_is_idempotent(client: TestClient, vapid):
    agency, client_id, session = _linked_client(client, "push_sub@test.com", "+911810000003")
    phone = Device(FCM + "phone")

    assert _subscribe(client, session, Device("https://169.254.169.254/latest/meta-data/x")).status_code == 422
    broken = Device(FCM + "broken")
    broken.json["keys"]["p256dh"] = _b64(b"\x05" + os.urandom(64))  # not an uncompressed P-256 point
    assert _subscribe(client, session, broken).status_code == 422
    assert _devices(client, agency, client_id) == 0

    assert _subscribe(client, session, phone).status_code == 204
    assert _subscribe(client, session, phone).status_code == 204  # the chat re-sends it on every open
    assert _devices(client, agency, client_id) == 1

    gone = client.post("/api/v1/portal/push/unsubscribe", json={"endpoint": phone.endpoint}, headers=_bearer(session))
    assert gone.status_code == 204
    assert _devices(client, agency, client_id) == 0


def test_a_client_keeps_at_most_ten_devices(client: TestClient, vapid, db_session):
    _, client_id, session = _linked_client(client, "push_cap@test.com", "+911810000004")
    for i in range(portal_push.MAX_DEVICES + 2):
        assert _subscribe(client, session, Device(f"{FCM}device-{i:02d}")).status_code == 204
    kept = {s.endpoint for s in db_session.query(PortalPushSubscription).filter_by(client_id=uuid.UUID(client_id))}
    assert len(kept) == portal_push.MAX_DEVICES
    assert f"{FCM}device-{portal_push.MAX_DEVICES + 1:02d}" in kept   # the newest stays
    assert f"{FCM}device-00" not in kept                               # the oldest goes


def test_one_client_cannot_unsubscribe_anothers_device(client: TestClient, vapid):
    agency_a, a_id, session_a = _linked_client(client, "push_a@test.com", "+911810000005")
    _, _, session_b = _linked_client(client, "push_b@test.com", "+911810000006")
    device = Device(FCM + "a-phone")
    _subscribe(client, session_a, device)
    client.post("/api/v1/portal/push/unsubscribe", json={"endpoint": device.endpoint}, headers=_bearer(session_b))
    assert _devices(client, agency_a, a_id) == 1


def test_regenerating_or_turning_off_the_link_stops_notifying_its_devices(client: TestClient, vapid):
    agency, client_id, session = _linked_client(client, "push_revoke@test.com", "+911810000007")
    device = Device(FCM + "revoke")
    _subscribe(client, session, device)

    new_link = _create_link(client, agency, client_id)   # regenerate
    assert new_link["notification_devices"] == 0
    # The same browser opens the new link: its subscription moves over.
    assert _subscribe(client, _open(client, new_link["url"]), device).status_code == 204
    assert _devices(client, agency, client_id) == 1

    client.delete(f"/api/v1/clients/{client_id}/chat-link", headers=_auth_headers(agency))
    _create_link(client, agency, client_id)
    assert _devices(client, agency, client_id) == 0


# ── When a push goes out ─────────────────────────────────────────────────────


def test_only_replies_on_voxly_chat_notify_the_client(client: TestClient, pushed):
    agency, client_id, session = _linked_client(client, "push_when@test.com", "+911810000008")

    p1, p2, p3 = _pipeline_patches(_ai("Your site goes live on Friday."))
    with p1, p2, p3:
        client.post("/api/v1/portal/messages", json={"text": "When do we launch?"}, headers=_bearer(session))
    # The AI's answer pushes; the client's own message doesn't.
    assert pushed == [(client_id, "Your site goes live on Friday.")]

    thread = f"/api/v1/conversations/{client_id}/messages"
    client.post(thread, json={"text": "Invoice attached", "channel": "voxly"}, headers=_auth_headers(agency))
    client.post(thread, json={"text": "Also on WhatsApp", "channel": "whatsapp"}, headers=_auth_headers(agency))
    assert pushed[1:] == [(client_id, "Invoice attached")]   # WhatsApp notifies on its own


async def test_a_push_is_encrypted_for_the_device_and_signed_by_the_server(client: TestClient, vapid, push_service):
    _, client_id, session = _linked_client(client, "push_e2e@test.com", "+911810000009")
    phone = Device(FCM + "e2e-phone")
    _subscribe(client, session, phone)
    requests, _ = push_service

    delivered = await portal_push.notify_client(uuid.UUID(client_id), "Your site is live!\n\nTake a look.")

    assert delivered == 1
    [sent] = requests
    assert sent["url"] == phone.endpoint
    assert sent["headers"]["ttl"] == str(portal_push.TTL_SECONDS)
    assert sent["headers"]["urgency"] == "high"
    assert sent["headers"]["content-encoding"] == "aes128gcm"
    # Only this device can read it…
    assert phone.decrypt(sent["data"]) == {
        "title": "Test Agency", "body": "Your site is live! Take a look.", "url": "/c", "tag": "voxly-chat",
    }
    # …and the push service can check it came from this server (VAPID).
    scheme, _, params = sent["headers"]["authorization"].partition(" ")
    fields = dict(part.split("=", 1) for part in params.split(","))
    assert scheme == "vapid" and fields["k"] == portal_push.public_key()
    claims = jwt.decode(fields["t"], vapid.public_key, algorithms=["ES256"], audience="https://fcm.googleapis.com")
    assert claims["sub"]


async def test_gone_devices_are_forgotten_and_others_kept(client: TestClient, vapid, push_service, db_session):
    _, client_id, session = _linked_client(client, "push_gone@test.com", "+911810000010")
    live, uninstalled, flaky = Device(FCM + "live"), Device(FCM + "uninstalled"), Device(FCM + "flaky")
    for device in (live, uninstalled, flaky):
        _subscribe(client, session, device)
    _, answers = push_service
    answers[uninstalled.endpoint] = 410
    answers[flaky.endpoint] = 503

    assert await portal_push.notify_client(uuid.UUID(client_id), "Hello") == 1
    kept = {s.endpoint for s in db_session.query(PortalPushSubscription).filter_by(client_id=uuid.UUID(client_id))}
    assert kept == {live.endpoint, flaky.endpoint}


async def test_no_push_for_a_deleted_client_or_when_push_is_off(client: TestClient, vapid, push_service, db_session, monkeypatch):
    _, client_id, session = _linked_client(client, "push_deleted@test.com", "+911810000011")
    _subscribe(client, session, Device(FCM + "deleted"))
    requests, _ = push_service

    monkeypatch.setattr(portal_push, "_vapid", lambda: None)
    assert await portal_push.notify_client(uuid.UUID(client_id), "Hello") == 0

    monkeypatch.setattr(portal_push, "_vapid", lambda: vapid)
    row = db_session.get(Client, uuid.UUID(client_id))
    row.deleted_at = row.created_at
    db_session.commit()
    assert await portal_push.notify_client(uuid.UUID(client_id), "Hello") == 0
    assert requests == []


async def test_scheduling_a_push_never_raises(vapid):
    portal_push.notify_in_background("not-a-uuid", "Hello")   # ignored
    portal_push.notify_in_background(uuid.uuid4(), "Hello")   # a client with no devices: a no-op task
    await portal_push.asyncio.gather(*portal_push._pending)


def test_the_preview_is_short_and_on_one_line():
    payload = json.loads(portal_push.notification_payload("Northwind", "Line one\nline two  " + "x" * 400))
    assert payload["body"].startswith("Line one line two x")
    assert len(payload["body"]) == portal_push.PREVIEW_CHARS and payload["body"].endswith("…")
