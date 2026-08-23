"""Tests for real-only conversation metadata (Phase 3 Milestone 2).

Same SessionLocal-patching requirement as test_conversation_state.py applies
here — process_incoming_message() bypasses the get_db test override, so every
integration test patches app.services.messaging_core.SessionLocal to the test
engine. See PH3-TD-01 (tracked, not addressed in this milestone).
"""
from unittest.mock import MagicMock, AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.messaging_core import process_incoming_message
from app.models.client import Client
from app.models.chat_history import ChatHistory
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


def _mock_agent(MockAgentClass, success: bool, response: str = "Here's your update",
                 tokens: int = 42, model: str = "claude-mock"):
    mock_instance = MagicMock()
    MockAgentClass.return_value = mock_instance
    result = {"success": success, "tokens_used": tokens, "model": model}
    if success:
        result["response"] = response
    else:
        result["error"] = "all providers exhausted"
    mock_instance.chat = AsyncMock(return_value=result)
    return mock_instance


def _latest_chat_row(db_session, client_id) -> ChatHistory:
    return (
        db_session.query(ChatHistory)
        .filter(ChatHistory.client_id == client_id)
        .order_by(ChatHistory.created_at.desc())
        .first()
    )


# ── ai_response_time_ms: real, measured, present on both outcomes ────


@pytest.mark.asyncio
async def test_successful_turn_records_real_latency(client: TestClient, db_session):
    token = _register_and_get_token(client, "latency_ok@test.com")
    client_id = _create_client(client, token, phone="+911400000001")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911400000001").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        _mock_agent(MockAgentClass, True)
        await process_incoming_message(channel="whatsapp", client=db_client, message="status?")

    row = _latest_chat_row(db_session, db_client.id)
    assert row is not None
    assert row.ai_response_time_ms is not None
    assert row.ai_response_time_ms >= 0  # real measured value, not fabricated


@pytest.mark.asyncio
async def test_failed_turn_still_records_real_latency(client: TestClient, db_session):
    """Even a failed AI turn measures real elapsed time — the client still waited."""
    token = _register_and_get_token(client, "latency_fail@test.com")
    client_id = _create_client(client, token, phone="+911400000002")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911400000002").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        _mock_agent(MockAgentClass, False)
        await process_incoming_message(channel="whatsapp", client=db_client, message="status?")

    row = _latest_chat_row(db_session, db_client.id)
    assert row is not None
    assert row.ai_response_time_ms is not None
    assert row.ai_response_time_ms >= 0


# ── model_used: real model name on success, NULL (not a sentinel) on failure ──


@pytest.mark.asyncio
async def test_successful_turn_records_real_model(client: TestClient, db_session):
    token = _register_and_get_token(client, "model_ok@test.com")
    client_id = _create_client(client, token, phone="+911400000003")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911400000003").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        _mock_agent(MockAgentClass, True, model="claude-sonnet-4-5")
        await process_incoming_message(channel="whatsapp", client=db_client, message="status?")

    row = _latest_chat_row(db_session, db_client.id)
    assert row.model_used == "claude-sonnet-4-5"


@pytest.mark.asyncio
async def test_failed_turn_records_null_model_not_sentinel(client: TestClient, db_session):
    """No model actually produced the (hardcoded apology) reply on failure —
    model_used must be NULL, not the old "error" placeholder string."""
    token = _register_and_get_token(client, "model_fail@test.com")
    client_id = _create_client(client, token, phone="+911400000004")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911400000004").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        _mock_agent(MockAgentClass, False)
        await process_incoming_message(channel="whatsapp", client=db_client, message="status?")

    row = _latest_chat_row(db_session, db_client.id)
    assert row.model_used is None
    assert row.model_used != "error"


# ── confidence / sentiment: never fabricated, always NULL today ──────


@pytest.mark.asyncio
async def test_confidence_and_sentiment_always_null(client: TestClient, db_session):
    """No real confidence-scoring or sentiment-analysis step exists anywhere
    in the pipeline — these must stay NULL on every outcome, success or
    failure, rather than any heuristic guess."""
    token = _register_and_get_token(client, "noheuristic@test.com")
    client_id = _create_client(client, token, phone="+911400000005")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911400000005").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        _mock_agent(MockAgentClass, True)
        await process_incoming_message(channel="whatsapp", client=db_client, message="status?")

    row = _latest_chat_row(db_session, db_client.id)
    assert row.confidence is None
    assert row.sentiment is None


# ── language: real detection only when the flag is actually on ───────


@pytest.mark.asyncio
async def test_language_null_when_detection_disabled(client: TestClient, db_session):
    """LANGUAGE_DETECTION_ENABLED defaults off — language must be NULL, not a
    fabricated 'en' masquerading as a real detection result."""
    token = _register_and_get_token(client, "lang_off@test.com")
    client_id = _create_client(client, token, phone="+911400000006")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911400000006").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        _mock_agent(MockAgentClass, True)
        await process_incoming_message(channel="whatsapp", client=db_client, message="kya haal hai")

    row = _latest_chat_row(db_session, db_client.id)
    assert row.language is None


@pytest.mark.asyncio
async def test_language_real_detection_when_enabled(client: TestClient, db_session):
    """With the flag on, a real Hinglish message must be detected as 'hi',
    not just always defaulted to 'en'."""
    token = _register_and_get_token(client, "lang_on@test.com")
    client_id = _create_client(client, token, phone="+911400000007")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911400000007").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass, \
         patch("app.services.messaging_core.settings.LANGUAGE_DETECTION_ENABLED", True):
        _mock_agent(MockAgentClass, True)
        # >=2 distinctive Hinglish tokens, per localization.py's conservative threshold.
        await process_incoming_message(channel="whatsapp", client=db_client, message="kya haal hai bhai")

    row = _latest_chat_row(db_session, db_client.id)
    assert row.language == "hi"


@pytest.mark.asyncio
async def test_language_real_detection_english_when_enabled(client: TestClient, db_session):
    token = _register_and_get_token(client, "lang_en@test.com")
    client_id = _create_client(client, token, phone="+911400000008")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911400000008").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass, \
         patch("app.services.messaging_core.settings.LANGUAGE_DETECTION_ENABLED", True):
        _mock_agent(MockAgentClass, True)
        await process_incoming_message(channel="whatsapp", client=db_client, message="What's the project status?")

    row = _latest_chat_row(db_session, db_client.id)
    assert row.language == "en"


# ── tokens_used: unaffected, still populated as before (regression guard) ──


@pytest.mark.asyncio
async def test_tokens_used_still_populated_on_success(client: TestClient, db_session):
    token = _register_and_get_token(client, "tokens@test.com")
    client_id = _create_client(client, token, phone="+911400000009")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911400000009").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        _mock_agent(MockAgentClass, True, tokens=123)
        await process_incoming_message(channel="whatsapp", client=db_client, message="status?")

    row = _latest_chat_row(db_session, db_client.id)
    assert row.tokens_used == 123
