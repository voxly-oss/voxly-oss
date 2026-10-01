"""Native Voxly channel: chat links, client sessions, the client's own thread,
AI and teammate replies over the portal, and the wall between client and
agency credentials."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.models.client import Client
from app.services import message_store
from app.services.messaging_core import upsert_conversation_state
from app.services.portal_auth import device_label, link_token, parse_link_token
from app.websockets.manager import portal_manager
from tests.conftest import TestingSessionLocal
from tests.test_realtime import _auth_headers, _create_client, _mock_ws, _register_and_get_token

ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _agency_and_client(client: TestClient, email: str, phone: str) -> tuple[str, str]:
    token = _register_and_get_token(client, email)
    return token, _create_client(client, token, phone=phone)


def _create_link(client: TestClient, agency_token: str, client_id: str) -> dict:
    resp = client.post(f"/api/v1/clients/{client_id}/chat-link", headers=_auth_headers(agency_token))
    assert resp.status_code == 201, resp.text
    return resp.json()


def _token_of(url: str) -> str:
    return url.rsplit("/c/", 1)[1]


def _open(client: TestClient, url: str) -> str:
    resp = client.post("/api/v1/portal/session", json={"token": _token_of(url)}, headers={"User-Agent": ANDROID_CHROME})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _ai(response: str = "On it!"):
    agent = MagicMock()
    agent.chat = AsyncMock(return_value={"success": True, "response": response, "tokens_used": 3, "model": "mock-model"})
    return agent


def _pipeline_patches(agent):
    return (
        patch("app.api.v1.portal.SessionLocal", TestingSessionLocal),
        patch("app.services.messaging_core.SessionLocal", TestingSessionLocal),
        patch("app.services.ai_agent.VoxlyAgent", return_value=agent),
    )


# ── Link tokens ──────────────────────────────────────────────────────────────


def test_link_tokens_round_trip_and_reject_tampering():
    link_id = uuid.uuid4()
    token = link_token(link_id)
    assert parse_link_token(token) == link_id
    id_part, mac_part = token.split(".")
    forged_id = link_token(uuid.uuid4()).split(".")[0]
    assert parse_link_token(f"{forged_id}.{mac_part}") is None   # someone else's id, this mac
    assert parse_link_token(f"{id_part}.{mac_part[:-1]}") is None
    assert parse_link_token("not-a-token") is None
    assert parse_link_token("") is None


def test_device_label_is_coarse():
    assert device_label(ANDROID_CHROME) == "Chrome on Android"
    assert device_label(None) is None


# ── Agency side ──────────────────────────────────────────────────────────────


def test_chat_link_lifecycle_and_tenant_scope(client: TestClient):
    agency, client_id = _agency_and_client(client, "portal_link@test.com", "+911800000001")
    url = f"/api/v1/clients/{client_id}/chat-link"

    assert client.get(url, headers=_auth_headers(agency)).json()["active"] is False
    first = _create_link(client, agency, client_id)
    assert first["active"] is True and "/c/" in first["url"]
    assert client.get(url, headers=_auth_headers(agency)).json()["url"] == first["url"]  # can be copied again

    second = _create_link(client, agency, client_id)  # regenerate
    assert second["url"] != first["url"]
    assert client.post("/api/v1/portal/session", json={"token": _token_of(first["url"])}).status_code == 404

    assert client.delete(url, headers=_auth_headers(agency)).status_code == 204
    assert client.get(url, headers=_auth_headers(agency)).json()["active"] is False
    assert client.delete(url, headers=_auth_headers(agency)).status_code == 404

    other = _register_and_get_token(client, "portal_link_other@test.com")
    assert client.get(url, headers=_auth_headers(other)).status_code == 404
    assert client.post(url, headers=_auth_headers(other)).status_code == 404
    assert client.delete(url, headers=_auth_headers(other)).status_code == 404


# ── Sessions ─────────────────────────────────────────────────────────────────


def test_opening_the_link_starts_a_30_day_session_and_shows_the_agency_the_device(client: TestClient):
    agency, client_id = _agency_and_client(client, "portal_open@test.com", "+911800000002")
    link = _create_link(client, agency, client_id)

    resp = client.post("/api/v1/portal/session", json={"token": _token_of(link["url"])}, headers={"User-Agent": ANDROID_CHROME})

    assert resp.status_code == 200
    body = resp.json()
    assert body["expires_in"] == 30 * 24 * 3600
    assert body["profile"] == {"client_id": client_id, "client_name": "Acme Corp", "agency_name": "Test Agency"}
    assert client.get("/api/v1/portal/me", headers=_bearer(body["access_token"])).json()["client_name"] == "Acme Corp"
    seen = client.get(f"/api/v1/clients/{client_id}/chat-link", headers=_auth_headers(agency)).json()
    assert seen["last_opened_device"] == "Chrome on Android" and seen["last_opened_at"]


def test_client_and_agency_credentials_cannot_stand_in_for_each_other(client: TestClient):
    agency, client_id = _agency_and_client(client, "portal_wall@test.com", "+911800000003")
    session = _open(client, _create_link(client, agency, client_id)["url"])

    assert client.get("/api/v1/clients", headers=_bearer(session)).status_code == 401
    assert client.get("/api/v1/conversations", headers=_bearer(session)).status_code == 401
    assert client.get(f"/api/v1/clients/{client_id}/chat-link", headers=_bearer(session)).status_code == 401
    assert client.get("/api/v1/portal/me", headers=_auth_headers(agency)).status_code == 401
    assert client.get("/api/v1/portal/messages").status_code == 401


def test_regenerating_or_revoking_the_link_ends_its_sessions(client: TestClient):
    agency, client_id = _agency_and_client(client, "portal_revoke@test.com", "+911800000004")
    first_session = _open(client, _create_link(client, agency, client_id)["url"])
    assert client.get("/api/v1/portal/me", headers=_bearer(first_session)).status_code == 200

    second_session = _open(client, _create_link(client, agency, client_id)["url"])
    assert client.get("/api/v1/portal/me", headers=_bearer(first_session)).status_code == 401
    assert client.get("/api/v1/portal/me", headers=_bearer(second_session)).status_code == 200

    client.delete(f"/api/v1/clients/{client_id}/chat-link", headers=_auth_headers(agency))
    assert client.get("/api/v1/portal/me", headers=_bearer(second_session)).status_code == 401


def test_a_deleted_client_loses_portal_access(client: TestClient):
    agency, client_id = _agency_and_client(client, "portal_deleted@test.com", "+911800000005")
    session = _open(client, _create_link(client, agency, client_id)["url"])
    assert client.delete(f"/api/v1/clients/{client_id}", headers=_auth_headers(agency)).status_code in (200, 204)
    assert client.get("/api/v1/portal/me", headers=_bearer(session)).status_code == 401


# ── Messages ─────────────────────────────────────────────────────────────────


def test_client_message_is_answered_by_the_ai_and_both_sides_see_the_thread(client: TestClient):
    agency, client_id = _agency_and_client(client, "portal_ai@test.com", "+911800000006")
    session = _open(client, _create_link(client, agency, client_id)["url"])

    p1, p2, p3 = _pipeline_patches(_ai("Your site goes live on Friday."))
    with p1, p2, p3:
        sent = client.post("/api/v1/portal/messages", json={"text": "  When do we launch?  "}, headers=_bearer(session))

    assert sent.status_code == 201
    assert sent.json()["body"] == "When do we launch?"
    assert (sent.json()["direction"], sent.json()["channel"]) == ("inbound", "voxly")

    thread = client.get("/api/v1/portal/messages", headers=_bearer(session)).json()["messages"]
    assert [(m["author_type"], m["body"], m["status"]) for m in thread] == [
        ("client", "When do we launch?", "received"),
        ("ai", "Your site goes live on Friday.", "sent"),
    ]
    # The client-facing shape carries no teammate ids, models or errors.
    assert set(thread[1]) == {"id", "direction", "author_type", "channel", "body", "status", "created_at"}

    inbox = client.get(f"/api/v1/conversations/{client_id}/messages", headers=_auth_headers(agency)).json()["messages"]
    assert [(m["channel"], m["author_type"]) for m in inbox] == [("voxly", "client"), ("voxly", "ai")]


def test_the_ai_stays_quiet_on_the_portal_while_a_teammate_owns_the_conversation(client: TestClient, db_session):
    agency, client_id = _agency_and_client(client, "portal_paused@test.com", "+911800000007")
    session = _open(client, _create_link(client, agency, client_id)["url"])
    owner = db_session.query(Client).filter(Client.id == uuid.UUID(client_id)).first().user_id
    upsert_conversation_state(db_session, uuid.UUID(client_id), "awaiting_human", updated_by_user_id=owner)

    agent = _ai()
    p1, p2, p3 = _pipeline_patches(agent)
    with p1, p2, p3:
        client.post("/api/v1/portal/messages", json={"text": "hello?"}, headers=_bearer(session))

    agent.chat.assert_not_called()
    thread = client.get("/api/v1/portal/messages", headers=_bearer(session)).json()["messages"]
    assert [m["body"] for m in thread] == ["hello?"]


def test_teammate_reply_on_the_voxly_channel_reaches_the_client(client: TestClient):
    agency, client_id = _agency_and_client(client, "portal_reply@test.com", "+911800000008")
    detail_url = f"/api/v1/conversations/{client_id}"
    assert "voxly" not in client.get(detail_url, headers=_auth_headers(agency)).json()["channels"]

    session = _open(client, _create_link(client, agency, client_id)["url"])
    assert "voxly" in client.get(detail_url, headers=_auth_headers(agency)).json()["channels"]

    reply = client.post(f"{detail_url}/messages", json={"text": "Hi from the team", "channel": "voxly"}, headers=_auth_headers(agency))
    assert reply.status_code == 201
    assert (reply.json()["channel"], reply.json()["status"]) == ("voxly", "sent")
    thread = client.get("/api/v1/portal/messages", headers=_bearer(session)).json()["messages"]
    assert [(m["author_type"], m["body"]) for m in thread] == [("agent", "Hi from the team")]

    client.delete(f"/api/v1/clients/{client_id}/chat-link", headers=_auth_headers(agency))
    assert "voxly" not in client.get(detail_url, headers=_auth_headers(agency)).json()["channels"]
    blocked = client.post(f"{detail_url}/messages", json={"text": "still there?", "channel": "voxly"}, headers=_auth_headers(agency))
    assert blocked.status_code == 400


def test_the_client_never_sees_a_reply_that_was_not_delivered(client: TestClient, monkeypatch):
    agency, client_id = _agency_and_client(client, "portal_failed@test.com", "+911800000009")
    session = _open(client, _create_link(client, agency, client_id)["url"])

    async def _reject(to_number, message):
        return False

    monkeypatch.setattr("app.services.whatsapp_service.send_whatsapp_message", _reject)
    failed = client.post(f"/api/v1/conversations/{client_id}/messages", json={"text": "via WhatsApp", "channel": "whatsapp"}, headers=_auth_headers(agency))
    assert failed.json()["status"] == "failed"
    assert client.get("/api/v1/portal/messages", headers=_bearer(session)).json()["messages"] == []


# ── Realtime ─────────────────────────────────────────────────────────────────


def test_portal_socket_needs_a_live_session_and_answers_pings(client: TestClient):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/v1/portal/ws?token=garbage") as ws:
            ws.receive_text()

    agency, client_id = _agency_and_client(client, "portal_ws@test.com", "+911800000010")
    session = _open(client, _create_link(client, agency, client_id)["url"])
    with client.websocket_connect(f"/api/v1/portal/ws?token={session}") as ws:
        ws.send_text('{"type": "ping"}')
        assert ws.receive_json() == {"type": "pong"}


@pytest.mark.asyncio
async def test_portal_fan_out_reaches_only_that_client_and_only_what_they_may_see(client: TestClient, db_session):
    _, a_id = _agency_and_client(client, "portal_fan_a@test.com", "+911800000011")
    _, b_id = _agency_and_client(client, "portal_fan_b@test.com", "+911800000012")
    client_a = db_session.query(Client).filter(Client.id == uuid.UUID(a_id)).first()
    ws_a, ws_b = _mock_ws(), _mock_ws()
    await portal_manager.connect(ws_a, a_id)
    await portal_manager.connect(ws_b, b_id)
    try:
        inbound = message_store.record_inbound(db_session, client_a, "voxly", "hi")
        await message_store.broadcast_message(client_a, inbound)
        undelivered = message_store.record_outbound(db_session, client_a, "whatsapp", "nope", author_type="agent")
        undelivered.status = "failed"
        db_session.commit()
        await message_store.broadcast_message(client_a, undelivered, event="message.updated")

        events = [call.args[0] for call in ws_a.send_json.call_args_list]
        assert [(e["event"], e["payload"]["message"]["body"]) for e in events] == [("message.created", "hi")]
        assert "author_user_id" not in events[0]["payload"]["message"]
        ws_b.send_json.assert_not_called()
    finally:
        portal_manager.disconnect(ws_a, a_id)
        portal_manager.disconnect(ws_b, b_id)
