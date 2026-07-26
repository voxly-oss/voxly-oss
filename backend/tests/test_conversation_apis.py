"""Tests for the standardized conversation APIs (Phase 3 Milestone 3):
GET /history/{client_id}, GET /messages, GET /conversations.

Same SessionLocal-patching requirement as the other Phase 3 test files —
process_incoming_message() bypasses the get_db test override. See PH3-TD-01.
"""
from unittest.mock import MagicMock, AsyncMock, patch
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.services.messaging_core import process_incoming_message, upsert_conversation_state
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


async def _send_message(client: TestClient, db_session, client_id: str, message: str,
                         success: bool = True, response: str = "Here's your update"):
    db_client = db_session.query(Client).filter(Client.id == UUID(client_id)).first()
    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        mock_instance = MagicMock()
        MockAgentClass.return_value = mock_instance
        result = {"success": success, "tokens_used": 10, "model": "claude-mock"}
        if success:
            result["response"] = response
        else:
            result["error"] = "all providers exhausted"
        mock_instance.chat = AsyncMock(return_value=result)
        await process_incoming_message(channel="whatsapp", client=db_client, message=message)


# ── GET /history/{client_id} — standardized shape, backward compatible ──


@pytest.mark.asyncio
async def test_history_includes_ai_response_alias_and_metadata(client: TestClient, db_session):
    token = _register_and_get_token(client, "hist1@test.com")
    client_id = _create_client(client, token, phone="+911500000001")
    _create_project(client, token, client_id)
    await _send_message(client, db_session, client_id, "status?", response="All good!")

    resp = client.get(f"/api/v1/chat/history/{client_id}", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["client_id"] == client_id
    assert data["status"] == "ai_handling"  # real state, Milestone 1
    msg = data["messages"][0]
    # Backward compatible: `response` still present, unchanged.
    assert msg["response"] == "All good!"
    # New: `ai_response` fixes the bug — same content, new key the frontend reads.
    assert msg["ai_response"] == "All good!"
    assert msg["channel"] == "whatsapp"
    assert "confidence" in msg and msg["confidence"] is None
    assert "ai_response_time_ms" in msg


def test_history_404_for_unowned_client(client: TestClient):
    token_a = _register_and_get_token(client, "hista@test.com")
    token_b = _register_and_get_token(client, "histb@test.com")
    client_b = _create_client(client, token_b, phone="+911500000002")

    resp = client.get(f"/api/v1/chat/history/{client_b}", headers=_auth_headers(token_a))
    assert resp.status_code == 404


def test_history_supports_skip_and_limit(client: TestClient):
    token = _register_and_get_token(client, "histpage@test.com")
    client_id = _create_client(client, token, phone="+911500000003")

    resp = client.get(
        f"/api/v1/chat/history/{client_id}?skip=0&limit=1", headers=_auth_headers(token)
    )
    assert resp.status_code == 200  # no messages yet, but skip/limit accepted and bounded


# ── GET /messages — standardized shape, backward compatible ─────────


@pytest.mark.asyncio
async def test_messages_includes_ai_response_alias(client: TestClient, db_session):
    token = _register_and_get_token(client, "msgs1@test.com")
    client_id = _create_client(client, token, phone="+911500000004")
    _create_project(client, token, client_id)
    await _send_message(client, db_session, client_id, "hi", response="Hello there!")

    resp = client.get("/api/v1/chat/messages", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    msg = data["messages"][0]
    assert msg["response"] == "Hello there!"
    assert msg["ai_response"] == "Hello there!"
    assert msg["client_id"] == client_id


def test_messages_unauthenticated(client: TestClient):
    resp = client.get("/api/v1/chat/messages")
    assert resp.status_code == 401


# ── GET /conversations — new, conversation-level grouping ───────────


def test_conversations_unauthenticated(client: TestClient):
    resp = client.get("/api/v1/chat/conversations")
    assert resp.status_code == 401


def test_conversations_empty_when_no_messages(client: TestClient):
    token = _register_and_get_token(client, "convempty@test.com")
    _create_client(client, token, phone="+911500000005")

    resp = client.get("/api/v1/chat/conversations", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"total": 0, "count": 0, "conversations": []}


@pytest.mark.asyncio
async def test_conversations_groups_by_client_not_by_message(client: TestClient, db_session):
    """The core fix: 3 messages from the same client must produce ONE
    conversation row with message_count=3, not 3 separate rows."""
    token = _register_and_get_token(client, "convgroup@test.com")
    client_id = _create_client(client, token, phone="+911500000006")
    _create_project(client, token, client_id)

    await _send_message(client, db_session, client_id, "msg 1")
    await _send_message(client, db_session, client_id, "msg 2")
    await _send_message(client, db_session, client_id, "msg 3", response="Latest reply")

    resp = client.get("/api/v1/chat/conversations", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["count"] == 1
    convo = data["conversations"][0]
    assert convo["message_count"] == 3
    assert convo["last_message"] == "msg 3"
    assert convo["last_response"] == "Latest reply"
    assert convo["status"] == "ai_handling"


@pytest.mark.asyncio
async def test_conversations_isolated_per_client(client: TestClient, db_session):
    token = _register_and_get_token(client, "convmulti@test.com")
    client_a = _create_client(client, token, phone="+911500000007", name="Client A")
    client_b = _create_client(client, token, phone="+911500000008", name="Client B")
    _create_project(client, token, client_a)
    _create_project(client, token, client_b)

    await _send_message(client, db_session, client_a, "from A")
    await _send_message(client, db_session, client_b, "from B")

    resp = client.get("/api/v1/chat/conversations", headers=_auth_headers(token))
    data = resp.json()
    assert data["total"] == 2
    names = {c["client_name"] for c in data["conversations"]}
    assert names == {"Client A", "Client B"}


@pytest.mark.asyncio
async def test_conversations_ordered_by_most_recent_activity(client: TestClient, db_session):
    token = _register_and_get_token(client, "convorder@test.com")
    client_a = _create_client(client, token, phone="+911500000009", name="Older")
    client_b = _create_client(client, token, phone="+911500000010", name="Newer")
    _create_project(client, token, client_a)
    _create_project(client, token, client_b)

    await _send_message(client, db_session, client_a, "first")
    await _send_message(client, db_session, client_b, "second")

    resp = client.get("/api/v1/chat/conversations", headers=_auth_headers(token))
    data = resp.json()
    assert data["conversations"][0]["client_name"] == "Newer"
    assert data["conversations"][1]["client_name"] == "Older"


@pytest.mark.asyncio
async def test_conversations_pagination(client: TestClient, db_session):
    token = _register_and_get_token(client, "convpage@test.com")
    for i in range(3):
        cid = _create_client(client, token, phone=f"+91150000002{i}", name=f"Client {i}")
        _create_project(client, token, cid)
        await _send_message(client, db_session, cid, f"hi from {i}")

    resp = client.get("/api/v1/chat/conversations?skip=0&limit=2", headers=_auth_headers(token))
    data = resp.json()
    assert data["total"] == 3  # real total across all matching conversations
    assert data["count"] == 2  # this page only
    assert len(data["conversations"]) == 2


@pytest.mark.asyncio
async def test_conversations_filter_by_status(client: TestClient, db_session):
    token = _register_and_get_token(client, "convfilter@test.com")
    ok_client = _create_client(client, token, phone="+911500000030", name="Handled")
    fail_client = _create_client(client, token, phone="+911500000031", name="NeedsHuman")
    _create_project(client, token, ok_client)
    _create_project(client, token, fail_client)

    await _send_message(client, db_session, ok_client, "hi", success=True)
    await _send_message(client, db_session, fail_client, "hi", success=False)

    resp = client.get("/api/v1/chat/conversations?status=awaiting_human", headers=_auth_headers(token))
    data = resp.json()
    assert data["total"] == 1
    assert data["conversations"][0]["client_name"] == "NeedsHuman"


@pytest.mark.asyncio
async def test_conversations_search_by_client_name(client: TestClient, db_session):
    token = _register_and_get_token(client, "convsearchname@test.com")
    client_id = _create_client(client, token, phone="+911500000032", name="Zebra Corp")
    other_id = _create_client(client, token, phone="+911500000033", name="Other Inc")
    _create_project(client, token, client_id)
    _create_project(client, token, other_id)
    await _send_message(client, db_session, client_id, "hi")
    await _send_message(client, db_session, other_id, "hi")

    resp = client.get("/api/v1/chat/conversations?search=zebra", headers=_auth_headers(token))
    data = resp.json()
    assert data["total"] == 1
    assert data["conversations"][0]["client_name"] == "Zebra Corp"


@pytest.mark.asyncio
async def test_conversations_search_by_message_content(client: TestClient, db_session):
    token = _register_and_get_token(client, "convsearchmsg@test.com")
    client_id = _create_client(client, token, phone="+911500000034")
    _create_project(client, token, client_id)
    await _send_message(client, db_session, client_id, "when is the deployment scheduled")

    resp = client.get("/api/v1/chat/conversations?search=deployment", headers=_auth_headers(token))
    data = resp.json()
    assert data["total"] == 1


@pytest.mark.asyncio
async def test_conversations_tenant_isolation(client: TestClient, db_session):
    token_a = _register_and_get_token(client, "convisoa@test.com")
    token_b = _register_and_get_token(client, "convisob@test.com")
    client_a = _create_client(client, token_a, phone="+911500000035", name="A's client")
    client_b = _create_client(client, token_b, phone="+911500000036", name="B's client")
    _create_project(client, token_a, client_a)
    _create_project(client, token_b, client_b)

    await _send_message(client, db_session, client_a, "hi")
    await _send_message(client, db_session, client_b, "hi")

    resp_a = client.get("/api/v1/chat/conversations", headers=_auth_headers(token_a))
    data_a = resp_a.json()
    assert data_a["total"] == 1
    assert data_a["conversations"][0]["client_name"] == "A's client"
