"""Tests for the realtime layer (Phase 3 Milestone 4):
ConnectionManager (subscription filtering, tenant isolation, stale cleanup),
build_event envelope shape, WebSocket endpoint (auth, ping/pong, subscribe),
and broadcast wiring from messaging_core.py.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.websockets.manager import ConnectionManager, build_event
from app.services.messaging_core import process_incoming_message
from app.models.client import Client
from tests.conftest import TestingSessionLocal


# ── Helpers ──────────────────────────────────────────────────────────


def _register_and_get_token(client: TestClient, email: str, credential: str = "Test1234") -> str:
    client.post("/api/v1/auth/register", json={
        "email": email, "password": credential,
        "full_name": "Test User", "agency_name": "Test Agency",
    })
    resp = client.post("/api/v1/auth/login", data={"username": email, "password": credential})
    return resp.json()["access_token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_client(client: TestClient, token: str, phone: str, name: str = "Acme Corp"):
    resp = client.post(
        "/api/v1/clients",
        json={"name": name, "phone": phone, "email": "acme@example.com"},
        headers=_auth_headers(token),
    )
    return resp.json()["id"]


def _create_project(client: TestClient, token: str, client_id: str, name: str = "Website"):
    resp = client.post(
        "/api/v1/projects",
        json={"client_id": client_id, "name": name},
        headers=_auth_headers(token),
    )
    return resp.json()["id"]


def _mock_ws() -> MagicMock:
    ws = MagicMock()
    ws.accept = AsyncMock()
    ws.send_json = AsyncMock()
    ws.close = AsyncMock()
    return ws


# ── build_event: standardized envelope shape ─────────────────────────


def test_build_event_shape():
    event = build_event(
        "conversation.message_completed",
        payload={"foo": "bar"},
        conversation_id="client-123",
        organization_id="org-456",
    )
    assert set(event.keys()) == {"event", "timestamp", "conversation_id", "organization_id", "payload"}
    assert event["event"] == "conversation.message_completed"
    assert event["conversation_id"] == "client-123"
    assert event["organization_id"] == "org-456"
    assert event["payload"] == {"foo": "bar"}
    # Real, parseable ISO 8601 timestamp, not a placeholder.
    from datetime import datetime
    datetime.fromisoformat(event["timestamp"])


def test_build_event_organization_id_optional():
    """organization_id is genuinely optional ('if applicable') -- must default
    to None, not an empty string or fabricated value."""
    event = build_event("conversation.state_changed", payload={}, conversation_id="c1")
    assert event["organization_id"] is None


# ── ConnectionManager: tenant isolation ───────────────────────────────


@pytest.mark.asyncio
async def test_broadcast_never_reaches_other_tenant():
    manager = ConnectionManager()
    ws_a, ws_b = _mock_ws(), _mock_ws()
    await manager.connect(ws_a, "user-a")
    await manager.connect(ws_b, "user-b")

    await manager.broadcast({"event": "x"}, "user-a")

    ws_a.send_json.assert_awaited_once()
    ws_b.send_json.assert_not_awaited()


@pytest.mark.asyncio
async def test_broadcast_reaches_all_tabs_for_same_user():
    manager = ConnectionManager()
    tab1, tab2 = _mock_ws(), _mock_ws()
    await manager.connect(tab1, "user-a")
    await manager.connect(tab2, "user-a")

    await manager.broadcast({"event": "x"}, "user-a")

    tab1.send_json.assert_awaited_once()
    tab2.send_json.assert_awaited_once()


# ── ConnectionManager: conversation subscription filtering ───────────


@pytest.mark.asyncio
async def test_unsubscribed_connection_receives_everything_by_default():
    """Backward compatible: a connection that never subscribes (every
    connection before this milestone, and every connection today unless the
    frontend is changed to opt in) still receives all events for its tenant."""
    manager = ConnectionManager()
    ws = _mock_ws()
    await manager.connect(ws, "user-a")

    await manager.broadcast({"event": "x"}, "user-a", conversation_id="client-1")
    await manager.broadcast({"event": "y"}, "user-a", conversation_id="client-2")

    assert ws.send_json.await_count == 2


@pytest.mark.asyncio
async def test_subscribed_connection_only_receives_matching_conversations():
    manager = ConnectionManager()
    ws = _mock_ws()
    await manager.connect(ws, "user-a")
    manager.set_subscription(ws, {"client-1"})

    await manager.broadcast({"event": "for client-1"}, "user-a", conversation_id="client-1")
    await manager.broadcast({"event": "for client-2"}, "user-a", conversation_id="client-2")

    assert ws.send_json.await_count == 1
    ws.send_json.assert_awaited_with({"event": "for client-1"})


@pytest.mark.asyncio
async def test_two_tabs_different_subscriptions_isolated():
    """Two tabs for the same user, each watching a different conversation --
    each must only get its own conversation's events, not the other's."""
    manager = ConnectionManager()
    tab_watching_1, tab_watching_2 = _mock_ws(), _mock_ws()
    await manager.connect(tab_watching_1, "user-a")
    await manager.connect(tab_watching_2, "user-a")
    manager.set_subscription(tab_watching_1, {"client-1"})
    manager.set_subscription(tab_watching_2, {"client-2"})

    await manager.broadcast({"event": "x"}, "user-a", conversation_id="client-1")

    tab_watching_1.send_json.assert_awaited_once()
    tab_watching_2.send_json.assert_not_awaited()


@pytest.mark.asyncio
async def test_clearing_subscription_restores_receive_everything():
    manager = ConnectionManager()
    ws = _mock_ws()
    await manager.connect(ws, "user-a")
    manager.set_subscription(ws, {"client-1"})
    manager.set_subscription(ws, None)  # e.g. client sends subscribe with empty list

    await manager.broadcast({"event": "x"}, "user-a", conversation_id="client-999")
    ws.send_json.assert_awaited_once()


# ── ConnectionManager: stale connection cleanup ───────────────────────


@pytest.mark.asyncio
async def test_broadcast_cleans_up_connection_that_fails_to_send():
    manager = ConnectionManager()
    dead_ws = _mock_ws()
    dead_ws.send_json = AsyncMock(side_effect=RuntimeError("connection closed"))
    await manager.connect(dead_ws, "user-a")

    await manager.broadcast({"event": "x"}, "user-a")

    assert manager.get_connection_count() == 0
    assert "user-a" not in manager.active_connections
    assert dead_ws not in manager.subscriptions


@pytest.mark.asyncio
async def test_disconnect_removes_subscription_state():
    manager = ConnectionManager()
    ws = _mock_ws()
    await manager.connect(ws, "user-a")
    manager.set_subscription(ws, {"client-1"})
    manager.disconnect(ws, "user-a")
    assert ws not in manager.subscriptions


# ── WebSocket endpoint: auth + ping/pong ──────────────────────────────


def test_websocket_rejects_invalid_token(client: TestClient):
    with pytest.raises(Exception):
        with client.websocket_connect("/api/v1/chat/ws?token=not-a-real-token"):
            pass


def test_websocket_accepts_valid_token_and_ping_pong(client: TestClient):
    """The /ws endpoint authenticates via its own SessionLocal() call (a
    short-lived session, deliberately not the get_db dependency, per its own
    docstring) -- which bypasses the test DB override exactly like
    messaging_core.py does (PH3-TD-01). Patched here for the same reason
    established in test_conversation_state.py, not addressed as a fix."""
    token = _register_and_get_token(client, "ws1@test.com")
    with patch("app.api.v1.chat.SessionLocal", TestingSessionLocal):
        with client.websocket_connect(f"/api/v1/chat/ws?token={token}") as websocket:
            websocket.send_json({"type": "ping"})
            response = websocket.receive_json()
            assert response == {"type": "pong"}


def test_websocket_subscribe_message_does_not_error(client: TestClient):
    """Sending a subscribe message must be accepted silently (no crash, no
    error response) -- the connection should keep working afterward."""
    token = _register_and_get_token(client, "ws2@test.com")
    with patch("app.api.v1.chat.SessionLocal", TestingSessionLocal):
        with client.websocket_connect(f"/api/v1/chat/ws?token={token}") as websocket:
            websocket.send_json({"type": "subscribe", "conversation_ids": ["some-client-id"]})
            # Connection must still be alive and responsive afterward.
            websocket.send_json({"type": "ping"})
            response = websocket.receive_json()
            assert response == {"type": "pong"}


# ── Broadcast wiring from messaging_core.py ───────────────────────────


@pytest.mark.asyncio
async def test_successful_turn_broadcasts_received_completed_and_state(client: TestClient, db_session):
    """A successful AI turn must broadcast exactly 3 events, in order:
    message_received (immediate), message_completed (real reply), and
    state_changed (ai_handling) -- fixing the audit finding that the old
    single broadcast fired before the AI reply existed and never told the
    dashboard the turn had actually finished."""
    token = _register_and_get_token(client, "broadcast_ok@test.com")
    client_id = _create_client(client, token, phone="+911600000001")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911600000001").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.messaging_core.manager.broadcast", new_callable=AsyncMock) as mock_broadcast, \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        mock_instance = MagicMock()
        MockAgentClass.return_value = mock_instance
        mock_instance.chat = AsyncMock(return_value={
            "success": True, "response": "All good!", "tokens_used": 10, "model": "claude-mock",
        })
        await process_incoming_message(channel="whatsapp", client=db_client, message="status?")

    event_names = [call.args[0]["event"] for call in mock_broadcast.call_args_list]
    assert event_names == [
        "conversation.message_received",
        "conversation.message_completed",
        "conversation.state_changed",
    ]

    completed_event = mock_broadcast.call_args_list[1].args[0]
    assert completed_event["payload"]["response"] == "All good!"
    assert completed_event["payload"]["ai_response"] == "All good!"
    assert completed_event["conversation_id"] == str(db_client.id)

    state_event = mock_broadcast.call_args_list[2].args[0]
    assert state_event["payload"]["status"] == "ai_handling"


@pytest.mark.asyncio
async def test_failed_turn_still_broadcasts_all_three_with_real_content(client: TestClient, db_session):
    token = _register_and_get_token(client, "broadcast_fail@test.com")
    client_id = _create_client(client, token, phone="+911600000002")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911600000002").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.messaging_core.manager.broadcast", new_callable=AsyncMock) as mock_broadcast, \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        mock_instance = MagicMock()
        MockAgentClass.return_value = mock_instance
        mock_instance.chat = AsyncMock(return_value={"success": False, "error": "all providers exhausted"})
        await process_incoming_message(channel="whatsapp", client=db_client, message="status?")

    event_names = [call.args[0]["event"] for call in mock_broadcast.call_args_list]
    assert event_names == [
        "conversation.message_received",
        "conversation.message_completed",
        "conversation.state_changed",
    ]
    state_event = mock_broadcast.call_args_list[2].args[0]
    assert state_event["payload"]["status"] == "awaiting_human"


@pytest.mark.asyncio
async def test_manual_state_update_broadcasts_state_changed(client: TestClient):
    token = _register_and_get_token(client, "manualbroadcast@test.com")
    client_id = _create_client(client, token, phone="+911600000003")

    with patch("app.services.messaging_core.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = client.patch(
            f"/api/v1/chat/conversations/{client_id}/status",
            json={"status": "resolved"},
            headers=_auth_headers(token),
        )
    assert resp.status_code == 200
    mock_broadcast.assert_awaited_once()
    event = mock_broadcast.call_args.args[0]
    assert event["event"] == "conversation.state_changed"
    assert event["payload"]["status"] == "resolved"
    assert event["payload"]["updated_by_user_id"] is not None
