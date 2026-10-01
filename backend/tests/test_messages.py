"""Messaging core: per-message persistence, the human-takeover pause, agent
replies over channel adapters, the thread API, and the chat_history backfill."""
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.models.chat_history import ChatHistory
from app.models.client import Client
from app.models.conversation_state import ConversationState
from app.models.message import Message
from app.services import message_store
from app.services.message_backfill import backfill_messages_from_chat_history
from app.services.messaging_core import process_incoming_message, upsert_conversation_state
from tests.conftest import TestingSessionLocal
from tests.test_realtime import _auth_headers, _create_client, _create_project, _register_and_get_token


@pytest.fixture
def sent(monkeypatch):
    """Capture WhatsApp sends made through the channel adapter."""
    calls = []

    async def _record(to_number, message):
        calls.append({"to": to_number, "body": message})
        return True

    monkeypatch.setattr("app.services.whatsapp_service.send_whatsapp_message", _record)
    return calls


def _ai(response="All good!", success=True):
    agent = MagicMock()
    agent.chat = AsyncMock(return_value={"success": success, "response": response, "tokens_used": 7, "model": "mock-model"})
    return agent


def _thread(db, client_id):
    return db.query(Message).filter(Message.client_id == client_id).order_by(Message.created_at).all()


@pytest.mark.asyncio
async def test_inbound_without_a_project_is_saved_and_the_ai_reply_is_recorded_as_sent(client: TestClient, db_session, sent):
    token = _register_and_get_token(client, "msg_noproject@test.com")
    _create_client(client, token, phone="+911700000001")  # deliberately no project
    db_client = db_session.query(Client).filter(Client.phone == "+911700000001").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent", return_value=_ai("Hi there")):
        reply = await process_incoming_message(
            channel="whatsapp", client=db_client, message="hello?", reply_address="+911700000001",
        )

    assert reply == "Hi there"
    rows = _thread(db_session, db_client.id)
    assert [(m.direction, m.author_type, m.status) for m in rows] == [
        ("inbound", "client", "received"),
        ("outbound", "ai", "sent"),
    ]
    assert rows[1].reply_to_id == rows[0].id
    assert sent == [{"to": "+911700000001", "body": "Hi there"}]


@pytest.mark.asyncio
async def test_ai_stays_quiet_while_a_human_owns_the_conversation(client: TestClient, db_session, sent):
    token = _register_and_get_token(client, "msg_paused@test.com")
    client_id = _create_client(client, token, phone="+911700000002")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911700000002").first()
    upsert_conversation_state(db_session, db_client.id, "awaiting_human", updated_by_user_id=db_client.user_id)

    agent = _ai()
    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal), \
         patch("app.services.ai_agent.VoxlyAgent", return_value=agent):
        reply = await process_incoming_message(
            channel="whatsapp", client=db_client, message="are you there?", reply_address="+911700000002",
        )

    assert reply is None
    agent.chat.assert_not_called()
    assert sent == []
    rows = _thread(db_session, db_client.id)
    assert [(m.direction, m.body) for m in rows] == [("inbound", "are you there?")]


@pytest.mark.asyncio
async def test_a_failed_ai_turn_flags_the_conversation_but_does_not_silence_the_ai(client: TestClient, db_session, sent):
    token = _register_and_get_token(client, "msg_autoflag@test.com")
    client_id = _create_client(client, token, phone="+911700000008")
    _create_project(client, token, client_id)
    db_client = db_session.query(Client).filter(Client.phone == "+911700000008").first()

    with patch("app.services.messaging_core.SessionLocal", TestingSessionLocal):
        with patch("app.services.ai_agent.VoxlyAgent", return_value=_ai("", success=False)):
            await process_incoming_message(channel="whatsapp", client=db_client, message="first", reply_address="+911700000008")
        db_session.expire_all()
        state = db_session.query(ConversationState).filter(ConversationState.client_id == db_client.id).first()
        assert state.status == "awaiting_human" and state.updated_by_user_id is None

        with patch("app.services.ai_agent.VoxlyAgent", return_value=_ai("Back online")):
            reply = await process_incoming_message(channel="whatsapp", client=db_client, message="second", reply_address="+911700000008")

    assert reply == "Back online"
    assert sent[-1] == {"to": "+911700000008", "body": "Back online"}


def test_agent_reply_is_sent_persisted_and_pauses_the_ai(client: TestClient, db_session, sent):
    token = _register_and_get_token(client, "msg_agent@test.com")
    client_id = _create_client(client, token, phone="+911700000003")

    resp = client.post(f"/api/v1/conversations/{client_id}/messages", json={"text": "  On it — call you at 3?  "}, headers=_auth_headers(token))

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["author_type"] == "agent"
    assert body["direction"] == "outbound"
    assert body["channel"] == "whatsapp"
    assert body["status"] == "sent"
    assert body["body"] == "On it — call you at 3?"
    assert sent == [{"to": "+911700000003", "body": "On it — call you at 3?"}]

    state = db_session.query(ConversationState).filter(ConversationState.client_id == uuid.UUID(client_id)).first()
    assert state is not None and state.status == "awaiting_human" and state.updated_by_user_id is not None

    thread = client.get(f"/api/v1/conversations/{client_id}/messages", headers=_auth_headers(token)).json()
    assert [m["id"] for m in thread["messages"]] == [body["id"]]


def test_a_rejected_send_is_recorded_as_failed_with_a_reason(client: TestClient, monkeypatch):
    token = _register_and_get_token(client, "msg_fail@test.com")
    client_id = _create_client(client, token, phone="+911700000004")

    async def _reject(to_number, message):
        return False

    monkeypatch.setattr("app.services.whatsapp_service.send_whatsapp_message", _reject)
    resp = client.post(f"/api/v1/conversations/{client_id}/messages", json={"text": "hello"}, headers=_auth_headers(token))

    assert resp.status_code == 201
    assert resp.json()["status"] == "failed"
    assert "rejected" in resp.json()["error"]


def test_thread_pages_oldest_first_with_a_cursor_and_is_tenant_scoped(client: TestClient, db_session):
    token = _register_and_get_token(client, "msg_page@test.com")
    client_id = _create_client(client, token, phone="+911700000005")
    db_client = db_session.query(Client).filter(Client.phone == "+911700000005").first()
    for i in range(5):
        msg = message_store.record_inbound(db_session, db_client, "whatsapp", f"m{i}")
        msg.created_at = datetime(2026, 9, 1, 10, i)
    db_session.commit()

    first = client.get(f"/api/v1/conversations/{client_id}/messages?limit=2", headers=_auth_headers(token)).json()
    assert [m["body"] for m in first["messages"]] == ["m3", "m4"]
    assert first["has_more"] is True

    older = client.get(
        f"/api/v1/conversations/{client_id}/messages?limit=2&before={first['messages'][0]['id']}",
        headers=_auth_headers(token),
    ).json()
    assert [m["body"] for m in older["messages"]] == ["m1", "m2"]

    other = _register_and_get_token(client, "msg_page_other@test.com")
    assert client.get(f"/api/v1/conversations/{client_id}/messages", headers=_auth_headers(other)).status_code == 404
    assert client.post(f"/api/v1/conversations/{client_id}/messages", json={"text": "x"}, headers=_auth_headers(other)).status_code == 404


def test_send_rejects_unsupported_channels_and_missing_addresses(client: TestClient, sent):
    token = _register_and_get_token(client, "msg_validate@test.com")
    client_id = _create_client(client, token, phone="+911700000006")

    slack = client.post(f"/api/v1/conversations/{client_id}/messages", json={"text": "hi", "channel": "slack"}, headers=_auth_headers(token))
    assert slack.status_code == 400 and "Unsupported channel" in slack.json()["detail"]

    telegram = client.post(f"/api/v1/conversations/{client_id}/messages", json={"text": "hi", "channel": "telegram"}, headers=_auth_headers(token))
    assert telegram.status_code == 400 and "no telegram address" in telegram.json()["detail"]
    assert sent == []


def test_backfill_splits_pairs_links_replies_and_is_idempotent(client: TestClient, db_session):
    token = _register_and_get_token(client, "msg_backfill@test.com")
    client_id = _create_client(client, token, phone="+911700000007")
    project_id = _create_project(client, token, client_id)
    cid, pid = uuid.UUID(client_id), uuid.UUID(project_id)
    db_session.add_all([
        ChatHistory(client_id=cid, project_id=pid, message="status?", response="On track", channel="whatsapp",
                    model_used="m", tokens_used=5, created_at=datetime(2026, 9, 1, 9, 0)),
        ChatHistory(client_id=cid, project_id=pid, message="thanks", response="", channel="telegram",
                    created_at=datetime(2026, 9, 1, 9, 5)),
    ])
    db_session.commit()

    assert backfill_messages_from_chat_history(db_session.connection()) == 3
    db_session.commit()
    rows = _thread(db_session, cid)
    assert [(m.direction, m.author_type, m.body, m.channel) for m in rows] == [
        ("inbound", "client", "status?", "whatsapp"),
        ("outbound", "ai", "On track", "whatsapp"),
        ("inbound", "client", "thanks", "telegram"),
    ]
    assert rows[1].reply_to_id == rows[0].id and rows[1].status == "sent"

    assert backfill_messages_from_chat_history(db_session.connection()) == 0
