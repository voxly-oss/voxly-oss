"""Tests for the backend-driven conversation state model (Phase 3 Milestone 1).

IMPORTANT: process_incoming_message() calls SessionLocal() directly (imported
from app.database), bypassing FastAPI's get_db dependency override entirely —
which is the only mechanism that redirects DB access to the SQLite test
database. Left unpatched, a direct call to process_incoming_message() in a
test talks to the REAL production database configured in .env. Every
integration test below patches app.services.messaging_core.SessionLocal to
tests.conftest.TestingSessionLocal (bound to the same shared test engine as
the `client`/`db_session` fixtures) specifically to prevent that. This is a
real architectural gap — see the Milestone 1 report for messaging_core.py —
not just test-plumbing; any future direct call to this pipeline needs the
same patch.
"""
from unittest.mock import MagicMock, AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.messaging_core import process_incoming_message, upsert_conversation_state
from app.models.client import Client
from app.models.conversation_state import ConversationState
from tests.conftest import TestingSessionLocal


# ── Helpers ──────────────────────────────────────────────────────────


def _register_and_get_token(client: TestClient, email: str, credential: str = "Test1234") -> str:
    client.post("/api/v1/auth/register", json={
        "email": email,
        "password": credential,
        "full_name": "Test User",
        "agency_name": "Test Agency",
    })
    resp = client.post("/api/v1/auth/login", data={
        "username": email,
        "password": credential,
    })
    return resp.json()["access_token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_client(client: TestClient, token: str, name: str = "Acme Corp",
                    phone: str = "+919876543210"):
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


def _mock_agent(MockAgentClass, success: bool, response: str = "Here's your update", tokens: int = 42):
    """Configure a patched VoxlyAgent so generate_client_response returns a
    controlled result without hitting a real AI provider, matching the
    established pattern in test_ai_integration.py."""
    mock_instance = MagicMock()
    MockAgentClass.return_value = mock_instance
    result = {"success": success, "tokens_used": tokens, "model": "mock"}
    if success:
        result["response"] = response
    else:
        result["error"] = "all providers exhausted"
    mock_instance.chat = AsyncMock(return_value=result)
    return mock_instance


# ── Unit: upsert_conversation_state ──────────────────────────────────


def test_upsert_creates_and_updates_state(client: TestClient, db_session):
    token = _register_and_get_token(client, "upsert@test.com")
    client_id = _create_client(client, token, phone="+911300000002")

    from uuid import UUID
    state = upsert_conversation_state(db_session, UUID(client_id), "ai_handling")
    assert state.status == "ai_handling"
    assert state.updated_by_user_id is None

    # Second call updates the same row (client_id is unique), doesn't create a duplicate.
    state2 = upsert_conversation_state(db_session, UUID(client_id), "resolved")
    assert state2.id == state.id
    assert state2.status == "resolved"

    count = db_session.query(ConversationState).filter(ConversationState.client_id == UUID(client_id)).count()
    assert count == 1


# ── Automatic transition, driven by the real ai_result["success"] signal ──


@pytest.mark.asyncio
async def test_successful_ai_turn_sets_ai_handling(client: TestClient, db_session):
    token = _register_and_get_token(client, "success@test.com")
    client_id = _create_client(client, token, phone="+911300000003")
    _create_project(client, token, client_id)

    db_client = db_session.query(Client).filter(Client.phone == "+911300000003").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        _mock_agent(MockAgentClass, True, response="All good!")
        await process_incoming_message(channel="whatsapp", client=db_client, message="status?")

    state = db_session.query(ConversationState).filter(ConversationState.client_id == db_client.id).first()
    assert state is not None
    assert state.status == "ai_handling"
    assert state.updated_by_user_id is None


@pytest.mark.asyncio
async def test_failed_ai_turn_sets_awaiting_human(client: TestClient, db_session):
    """A real AI failure (all providers exhausted) must flag awaiting_human,
    not silently claim ai_handling — this is the real signal Milestone 1 uses,
    not a fabricated one."""
    token = _register_and_get_token(client, "fail@test.com")
    client_id = _create_client(client, token, phone="+911300000004")
    _create_project(client, token, client_id)

    db_client = db_session.query(Client).filter(Client.phone == "+911300000004").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        _mock_agent(MockAgentClass, False)
        await process_incoming_message(channel="whatsapp", client=db_client, message="status?")

    state = db_session.query(ConversationState).filter(ConversationState.client_id == db_client.id).first()
    assert state is not None
    assert state.status == "awaiting_human"


@pytest.mark.asyncio
async def test_new_message_overwrites_manual_resolved_state(client: TestClient, db_session):
    """A conversation manually marked resolved must flip back to an active
    state once the client sends a new message — resolved shouldn't be sticky
    across new activity."""
    token = _register_and_get_token(client, "reopen@test.com")
    client_id = _create_client(client, token, phone="+911300000005")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911300000005").first()

    upsert_conversation_state(db_session, db_client.id, "resolved", updated_by_user_id=None)

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        _mock_agent(MockAgentClass, True, response="Back again")
        await process_incoming_message(channel="whatsapp", client=db_client, message="hi again")

    state = db_session.query(ConversationState).filter(ConversationState.client_id == db_client.id).first()
    assert state.status == "ai_handling"


# ── GET /conversations/{client_id}/status ────────────────────────────


def test_get_conversation_state_unauthenticated(client: TestClient):
    resp = client.get("/api/v1/chat/conversations/00000000-0000-0000-0000-000000000000/status")
    assert resp.status_code == 401


def test_get_conversation_state_404_when_no_state_yet(client: TestClient):
    token = _register_and_get_token(client, "nostate@test.com")
    client_id = _create_client(client, token, phone="+911300000006")

    resp = client.get(f"/api/v1/chat/conversations/{client_id}/status", headers=_auth_headers(token))
    assert resp.status_code == 404


def test_get_conversation_state_404_for_unowned_client(client: TestClient):
    token_a = _register_and_get_token(client, "geta@test.com")
    token_b = _register_and_get_token(client, "getb@test.com")
    client_b_id = _create_client(client, token_b, phone="+911300000007")

    resp = client.get(f"/api/v1/chat/conversations/{client_b_id}/status", headers=_auth_headers(token_a))
    assert resp.status_code == 404


def test_get_conversation_state_returns_current_status(client: TestClient, db_session):
    token = _register_and_get_token(client, "getstate@test.com")
    client_id = _create_client(client, token, phone="+911300000008")

    from uuid import UUID
    upsert_conversation_state(db_session, UUID(client_id), "escalated")

    resp = client.get(f"/api/v1/chat/conversations/{client_id}/status", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["status"] == "escalated"
    assert resp.json()["client_id"] == client_id


# ── PATCH /conversations/{client_id}/status ──────────────────────────


def test_patch_conversation_state_unauthenticated(client: TestClient):
    resp = client.patch(
        "/api/v1/chat/conversations/00000000-0000-0000-0000-000000000000/status",
        json={"status": "resolved"},
    )
    assert resp.status_code == 401


@pytest.mark.parametrize("status", ["awaiting_human", "ai_handling", "resolved", "escalated"])
def test_patch_conversation_state_accepts_all_valid_values(client: TestClient, status):
    token = _register_and_get_token(client, f"patch_{status}@test.com")
    client_id = _create_client(client, token, phone=f"+9113000009{['awaiting_human','ai_handling','resolved','escalated'].index(status)}")

    resp = client.patch(
        f"/api/v1/chat/conversations/{client_id}/status",
        json={"status": status},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == status
    assert data["updated_by_user_id"] is not None  # human-set, not the automatic pipeline


def test_patch_conversation_state_rejects_invalid_value(client: TestClient):
    token = _register_and_get_token(client, "badstatus@test.com")
    client_id = _create_client(client, token, phone="+911300000010")

    resp = client.patch(
        f"/api/v1/chat/conversations/{client_id}/status",
        json={"status": "not_a_real_status"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_patch_conversation_state_404_for_unowned_client(client: TestClient):
    token_a = _register_and_get_token(client, "patcha@test.com")
    token_b = _register_and_get_token(client, "patchb@test.com")
    client_b_id = _create_client(client, token_b, phone="+911300000011")

    resp = client.patch(
        f"/api/v1/chat/conversations/{client_b_id}/status",
        json={"status": "resolved"},
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 404

    # Confirm it truly wasn't changed for B either (no state existed, still doesn't).
    resp_get = client.get(f"/api/v1/chat/conversations/{client_b_id}/status", headers=_auth_headers(token_b))
    assert resp_get.status_code == 404
