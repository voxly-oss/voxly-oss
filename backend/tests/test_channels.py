"""Tests for the read-only channel-activity aggregate endpoint."""
from datetime import datetime, timedelta, time
from uuid import UUID

from fastapi.testclient import TestClient

from app.models.chat_history import ChatHistory


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


def _add_chat_row(db_session, client_id: str, channel: str, created_at: datetime,
                   message: str = "hi", response: str = "hello"):
    row = ChatHistory(
        client_id=UUID(client_id),
        message=message,
        response=response,
        channel=channel,
        created_at=created_at,
    )
    db_session.add(row)
    db_session.commit()
    return row


# ── Auth guard ───────────────────────────────────────────────────────


def test_list_channels_unauthenticated(client: TestClient):
    resp = client.get("/api/v1/channels")
    assert resp.status_code == 401


# ── Empty state ──────────────────────────────────────────────────────


def test_list_channels_empty_when_no_history(client: TestClient):
    """A user with clients but zero chat_history rows gets an empty list, not an error."""
    token = _register_and_get_token(client, "empty@test.com")
    _create_client(client, token, phone="+911200000001")

    resp = client.get("/api/v1/channels", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_channels_empty_when_no_clients(client: TestClient):
    token = _register_and_get_token(client, "noclients@test.com")
    resp = client.get("/api/v1/channels", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json() == []


# ── Aggregation correctness ──────────────────────────────────────────


def test_volume_today_counts_only_todays_rows(client: TestClient, db_session):
    token = _register_and_get_token(client, "volume@test.com")
    client_id = _create_client(client, token, phone="+911200000002")

    now = datetime.utcnow()
    yesterday = now - timedelta(days=1, hours=1)
    _add_chat_row(db_session, client_id, "whatsapp", now)
    _add_chat_row(db_session, client_id, "whatsapp", now)
    _add_chat_row(db_session, client_id, "whatsapp", yesterday)

    resp = client.get("/api/v1/channels", headers=_auth_headers(token))
    assert resp.status_code == 200
    rows = resp.json()
    wa_row = next(r for r in rows if r["channel"] == "whatsapp")
    assert wa_row["volume_today"] == 2  # yesterday's row excluded


def test_last_activity_is_max_timestamp_across_all_time(client: TestClient, db_session):
    """last_activity must be the all-time max, not just today's max."""
    token = _register_and_get_token(client, "lastactivity@test.com")
    client_id = _create_client(client, token, phone="+911200000003")

    older = datetime.utcnow() - timedelta(days=5)
    newer = datetime.utcnow() - timedelta(hours=2)
    _add_chat_row(db_session, client_id, "telegram", older)
    _add_chat_row(db_session, client_id, "telegram", newer)

    resp = client.get("/api/v1/channels", headers=_auth_headers(token))
    rows = resp.json()
    tg_row = next(r for r in rows if r["channel"] == "telegram")
    # Compare with second precision — JSON round-trips microseconds fine, but
    # keep the assertion robust to serialization formatting.
    assert abs((datetime.fromisoformat(tg_row["last_activity"]) - newer).total_seconds()) < 1


def test_separate_rows_per_client_and_channel(client: TestClient, db_session):
    """Aggregation must be grouped by (client_id, channel), not merged across clients or channels."""
    token = _register_and_get_token(client, "grouping@test.com")
    client_a = _create_client(client, token, name="A", phone="+911200000004")
    client_b = _create_client(client, token, name="B", phone="+911200000005")

    now = datetime.utcnow()
    _add_chat_row(db_session, client_a, "whatsapp", now)
    _add_chat_row(db_session, client_a, "telegram", now)
    _add_chat_row(db_session, client_b, "whatsapp", now)

    resp = client.get("/api/v1/channels", headers=_auth_headers(token))
    rows = resp.json()
    assert len(rows) == 3  # (A, whatsapp), (A, telegram), (B, whatsapp) — never merged

    keys = {(r["client_id"], r["channel"]) for r in rows}
    assert (client_a, "whatsapp") in keys
    assert (client_a, "telegram") in keys
    assert (client_b, "whatsapp") in keys


def test_no_email_channel_ever_returned(client: TestClient, db_session):
    """chat_history.channel is constrained to whatsapp/telegram — this endpoint must
    never fabricate or return an 'email' row, even if a client has an email address."""
    token = _register_and_get_token(client, "noemail@test.com")
    client_id = _create_client(client, token, phone="+911200000006")
    _add_chat_row(db_session, client_id, "whatsapp", datetime.utcnow())

    resp = client.get("/api/v1/channels", headers=_auth_headers(token))
    rows = resp.json()
    channels = {r["channel"] for r in rows}
    assert "email" not in channels
    assert channels == {"whatsapp"}


# ── Authorization / tenant isolation ─────────────────────────────────


def test_user_cannot_see_other_users_channel_activity(client: TestClient, db_session):
    token_a = _register_and_get_token(client, "iso_a@test.com")
    token_b = _register_and_get_token(client, "iso_b@test.com")
    client_a = _create_client(client, token_a, name="A's Client", phone="+911200000007")
    client_b = _create_client(client, token_b, name="B's Client", phone="+911200000008")

    now = datetime.utcnow()
    _add_chat_row(db_session, client_a, "whatsapp", now)
    _add_chat_row(db_session, client_b, "telegram", now)

    resp_a = client.get("/api/v1/channels", headers=_auth_headers(token_a))
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert len(data_a) == 1
    assert data_a[0]["client_id"] == client_a
    assert data_a[0]["channel"] == "whatsapp"

    resp_b = client.get("/api/v1/channels", headers=_auth_headers(token_b))
    data_b = resp_b.json()
    assert len(data_b) == 1
    assert data_b[0]["client_id"] == client_b
