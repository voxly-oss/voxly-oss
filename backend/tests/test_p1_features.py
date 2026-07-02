"""Tests for P1 features: conversation memory, message idempotency, health checks."""
import uuid
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.models.user import User
from app.models.client import Client
from app.models.chat_history import ChatHistory
from app.services.messaging_core import _load_recent_history, is_duplicate_message


def _make_client_with_history(db, turns: int) -> Client:
    user = User(id=uuid.uuid4(), email=f"u{uuid.uuid4().hex[:6]}@t.com", password_hash="x", is_active=True)
    db.add(user)
    db.commit()
    client = Client(id=uuid.uuid4(), user_id=user.id, name="Acme", phone=f"+91{uuid.uuid4().int % 10**10:010d}")
    db.add(client)
    db.commit()
    # Explicit increasing timestamps so ordering is deterministic (a tight
    # insert loop can otherwise produce identical created_at values).
    base = datetime(2026, 1, 1, 12, 0, 0)
    for i in range(turns):
        db.add(ChatHistory(
            id=uuid.uuid4(), client_id=client.id,
            message=f"msg {i}", response=f"reply {i}", channel="whatsapp",
            created_at=base + timedelta(seconds=i),
        ))
    db.commit()
    return client


# ── Conversation memory ──────────────────────────────────────────────

def test_load_recent_history_returns_ordered_turns(db_session):
    client = _make_client_with_history(db_session, turns=3)
    history = _load_recent_history(db_session, client, limit=6)

    # 3 exchanges -> 6 role turns, oldest first, alternating user/assistant
    assert len(history) == 6
    assert history[0] == {"role": "user", "content": "msg 0"}
    assert history[1] == {"role": "assistant", "content": "reply 0"}
    assert history[-1] == {"role": "assistant", "content": "reply 2"}


def test_load_recent_history_respects_limit(db_session):
    client = _make_client_with_history(db_session, turns=10)
    history = _load_recent_history(db_session, client, limit=2)
    # limit=2 exchanges -> 4 turns, and they must be the MOST recent ones
    assert len(history) == 4
    assert history[-1] == {"role": "assistant", "content": "reply 9"}


def test_load_recent_history_empty_for_new_client(db_session):
    client = _make_client_with_history(db_session, turns=0)
    assert _load_recent_history(db_session, client) == []


# ── Message idempotency ──────────────────────────────────────────────

def test_duplicate_message_detection(db_session):
    # First sighting is not a duplicate; it records the id.
    assert is_duplicate_message(db_session, "whatsapp", "SM123") is False
    # Second sighting of the same id IS a duplicate.
    assert is_duplicate_message(db_session, "whatsapp", "SM123") is True


def test_duplicate_message_namespaced_by_channel(db_session):
    is_duplicate_message(db_session, "whatsapp", "42")
    # Same raw id on a different channel is a distinct message.
    assert is_duplicate_message(db_session, "telegram", "42") is False


def test_empty_message_id_never_deduped(db_session):
    # We can't prove uniqueness for an empty id, so never treat it as duplicate.
    assert is_duplicate_message(db_session, "whatsapp", None) is False
    assert is_duplicate_message(db_session, "whatsapp", "") is False


# ── Health checks ────────────────────────────────────────────────────

def test_liveness_probe(client: TestClient):
    resp = client.get("/health/live")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


def test_readiness_probe_reports_dependencies(client: TestClient):
    """Readiness returns a per-dependency breakdown; DB is reachable in tests."""
    resp = client.get("/health/ready")
    body = resp.json()
    assert "checks" in body
    assert body["checks"]["database"] is True
    # Redis is typically unavailable in CI/unit runs -> degraded/503 is expected.
    assert resp.status_code in (200, 503)
