"""WAHA (self-hosted, open-source) WhatsApp transport: inbound webhook + outbound adapter."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.services import whatsapp_service
from app.services.whatsapp_service import phone_to_waha_chat_id, waha_chat_id_to_phone

# The suite-wide autouse fixture replaces the module attribute; keep the real one.
_real_send = whatsapp_service.send_whatsapp_message

URL = "/api/v1/whatsapp/waha-webhook"
SECRET = "waha-test-secret"


def _event(**payload):
    base = {"from": "919729041423@c.us", "body": "hello", "fromMe": False, "id": "m1"}
    return {"event": "message", "session": "default", "payload": {**base, **payload}}


@pytest.fixture
def waha_secret(monkeypatch):
    monkeypatch.setattr(settings, "WAHA_WEBHOOK_SECRET", SECRET)


def test_chat_id_round_trip():
    assert phone_to_waha_chat_id("+91 97290-41423") == "919729041423@c.us"
    assert phone_to_waha_chat_id("whatsapp:+919729041423") == "919729041423@c.us"
    assert waha_chat_id_to_phone("919729041423@c.us") == "+919729041423"


@pytest.mark.parametrize("bad", ["12345@g.us", "status@broadcast", "abc@lid", "", None])
def test_chat_id_rejects_groups_status_and_lid(bad):
    assert waha_chat_id_to_phone(bad) is None


def test_webhook_503_when_secret_not_configured(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "WAHA_WEBHOOK_SECRET", "")
    assert client.post(URL, json=_event()).status_code == 503


@pytest.mark.parametrize("headers", [{}, {"X-Voxly-Webhook-Token": "wrong"}])
def test_webhook_rejects_missing_or_wrong_token(client: TestClient, waha_secret, headers):
    assert client.post(URL, json=_event(), headers=headers).status_code == 401


def test_webhook_accepts_inbound_text_and_dispatches(client: TestClient, waha_secret):
    with patch("app.api.v1.whatsapp._process_whatsapp_message", new=AsyncMock()) as proc:
        resp = client.post(URL, json=_event(), headers={"X-Voxly-Webhook-Token": SECRET})
    assert resp.status_code == 200
    assert resp.json() == {"status": "processing"}
    proc.assert_awaited_once_with("+919729041423", "hello", "m1")


def test_webhook_resolves_lid_sender_to_phone(client: TestClient, waha_secret):
    with patch("app.api.v1.whatsapp._process_whatsapp_message", new=AsyncMock()) as proc, patch(
        "app.api.v1.whatsapp.resolve_waha_lid", new=AsyncMock(return_value="+919729041423")
    ):
        resp = client.post(
            URL, json=_event(**{"from": "555@lid"}), headers={"X-Voxly-Webhook-Token": SECRET}
        )
    assert resp.json() == {"status": "processing"}
    proc.assert_awaited_once_with("+919729041423", "hello", "m1")


@pytest.mark.parametrize(
    "body",
    [
        _event(fromMe=True),  # our own outgoing echo must never loop back into the AI
        _event(**{"from": "120363@g.us"}),  # group
        _event(body="   "),  # empty
        _event(**{"from": "999@lid"}),  # @lid that WAHA cannot map to a phone
        {"event": "session.status", "payload": {}},  # non-message event
    ],
)
def test_webhook_ignores_non_inbound(client: TestClient, waha_secret, body):
    with patch("app.api.v1.whatsapp._process_whatsapp_message", new=AsyncMock()) as proc, patch(
        "app.api.v1.whatsapp.resolve_waha_lid", new=AsyncMock(return_value=None)
    ):
        resp = client.post(URL, json=body, headers={"X-Voxly-Webhook-Token": SECRET})
    assert resp.status_code == 200
    assert resp.json()["status"] == "ignored"
    proc.assert_not_awaited()


@pytest.mark.asyncio
async def test_send_uses_waha_when_provider_is_waha(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "waha")
    monkeypatch.setattr(settings, "WAHA_URL", "http://waha:3000/")
    monkeypatch.setattr(settings, "WAHA_API_KEY", "k")
    posted = {}

    class _Resp:
        def raise_for_status(self):
            pass

    class _Http:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json, headers):
            posted.update(url=url, json=json, headers=headers)
            return _Resp()

    with patch.object(whatsapp_service.httpx, "AsyncClient", _Http):
        ok = await _real_send("+919729041423", "hi")

    assert ok is True
    assert posted["url"] == "http://waha:3000/api/sendText"
    assert posted["json"] == {"session": "default", "chatId": "919729041423@c.us", "text": "hi"}
    assert posted["headers"] == {"X-Api-Key": "k"}


@pytest.mark.asyncio
async def test_send_returns_false_when_gateway_is_down(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "waha")
    monkeypatch.setattr(settings, "WAHA_URL", "http://127.0.0.1:1")  # nothing listens here
    assert await _real_send("+919729041423", "hi") is False
