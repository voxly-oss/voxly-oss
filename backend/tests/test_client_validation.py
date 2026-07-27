"""Tests for client phone/name validation and per-tenant uniqueness.

Regression guards for PRODUCTION_ACCEPTANCE_REPORT.md findings:

BUG-04: clients.phone carried a table-wide UNIQUE constraint, so once one
agency registered a client with a given number, no other agency could ever
register a client with that same number -- and a soft-deleted client's
number stayed permanently unusable, even by its own original owner.

BUG-13/13a: phone had no format validation ("12345" was accepted) and
name/company had no length cap, so an over-length name reached the DB
unvalidated and came back as an unhandled 500 instead of a 422.

BUG-14: the phone-conflict 409 said "This Telegram Chat ID is already linked
to another client" even for a plain phone conflict, because the branch
detection matched on a substring of the compiled SQL statement (which lists
every column, including telegram_chat_id) rather than the actual DB error.
"""
from fastapi.testclient import TestClient


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


# ── BUG-04: phone uniqueness is per-tenant, not global ──────────────


def test_two_tenants_can_share_a_phone_number(client: TestClient):
    token_a = _register_and_get_token(client, "cv1a@test.com")
    token_b = _register_and_get_token(client, "cv1b@test.com")

    resp_a = client.post(
        "/api/v1/clients",
        json={"name": "Agency A's Client", "phone": "+919811111111", "email": "a@example.com"},
        headers=_auth_headers(token_a),
    )
    resp_b = client.post(
        "/api/v1/clients",
        json={"name": "Agency B's Client", "phone": "+919811111111", "email": "b@example.com"},
        headers=_auth_headers(token_b),
    )
    assert resp_a.status_code == 201
    assert resp_b.status_code == 201


def test_soft_deleted_clients_phone_becomes_reusable(client: TestClient):
    token = _register_and_get_token(client, "cv2@test.com")
    first = client.post(
        "/api/v1/clients",
        json={"name": "First", "phone": "+919822222222", "email": "first@example.com"},
        headers=_auth_headers(token),
    )
    assert first.status_code == 201
    client.delete(f"/api/v1/clients/{first.json()['id']}", headers=_auth_headers(token))

    second = client.post(
        "/api/v1/clients",
        json={"name": "Second", "phone": "+919822222222", "email": "second@example.com"},
        headers=_auth_headers(token),
    )
    assert second.status_code == 201


def test_same_tenant_duplicate_phone_still_rejected(client: TestClient):
    """The per-tenant scope narrows the constraint; it must not remove it."""
    token = _register_and_get_token(client, "cv3@test.com")
    client.post(
        "/api/v1/clients",
        json={"name": "First", "phone": "+919833333333", "email": "first@example.com"},
        headers=_auth_headers(token),
    )
    resp = client.post(
        "/api/v1/clients",
        json={"name": "Second", "phone": "+919833333333", "email": "second@example.com"},
        headers=_auth_headers(token),
    )
    assert resp.status_code in (400, 409)
    assert "telegram" not in resp.json()["detail"].lower()


# ── BUG-13/13a: input validation ─────────────────────────────────────


def test_invalid_phone_format_rejected(client: TestClient):
    token = _register_and_get_token(client, "cv4@test.com")
    resp = client.post(
        "/api/v1/clients",
        json={"name": "Bad Phone", "phone": "12345", "email": "bad@example.com"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_overlength_name_rejected_with_422_not_500(client: TestClient):
    token = _register_and_get_token(client, "cv5@test.com")
    resp = client.post(
        "/api/v1/clients",
        json={"name": "A" * 300, "phone": "+919844444444", "email": "long@example.com"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422
