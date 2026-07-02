"""Regression tests for the GDPR export (F5) and API-key auth (F4) fixes."""
import uuid

from fastapi.testclient import TestClient

from app.models.api_key import APIKey
from app.models.user import User
from app.utils.api_key_auth import generate_api_key


def _register_and_get_token(client: TestClient, email: str, credential: str = "Test1234") -> str:
    client.post("/api/v1/auth/register", json={
        "email": email, "password": credential,
        "full_name": "Test User", "agency_name": "Test Agency",
    })
    resp = client.post("/api/v1/auth/login", data={"username": email, "password": credential})
    return resp.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── F5: GDPR export no longer crashes ─────────────────────────────────

def test_gdpr_export_succeeds(client: TestClient):
    """GET /me/export returns user data (previously 500'd on a bad import)."""
    token = _register_and_get_token(client, "export@test.com")
    client.post(
        "/api/v1/clients",
        json={"name": "Acme", "phone": "+919876500000"},
        headers=_headers(token),
    )

    resp = client.get("/api/v1/auth/me/export", headers=_headers(token))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["user_profile"]["email"] == "export@test.com"
    assert len(data["clients"]) == 1
    assert "ai_keys" in data  # key section present even when empty


# ── F4: API keys authenticate real endpoints, scoped ─────────────────

def _issue_api_key(db_session, email: str, scopes: list[str]) -> str:
    """Create a user + API key directly and return the full key string."""
    user = User(id=uuid.uuid4(), email=email, password_hash="x", is_active=True)
    db_session.add(user)
    db_session.commit()

    full_key, prefix, key_hash = generate_api_key()
    db_session.add(APIKey(
        id=uuid.uuid4(), user_id=user.id, key_hash=key_hash,
        key_prefix=prefix, label="test", scopes=scopes, is_active=True,
    ))
    db_session.commit()
    return full_key


def test_api_key_with_scope_can_list_clients(client: TestClient, db_session):
    """An API key with clients:read can call the clients endpoint."""
    key = _issue_api_key(db_session, "apikey_ok@test.com", ["clients:read"])
    resp = client.get("/api/v1/clients", headers={"X-API-Key": key})
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), list)


def test_api_key_without_scope_is_forbidden(client: TestClient, db_session):
    """An API key lacking clients:read is rejected with 403."""
    key = _issue_api_key(db_session, "apikey_noscope@test.com", ["projects:read"])
    resp = client.get("/api/v1/clients", headers={"X-API-Key": key})
    assert resp.status_code == 403, resp.text


def test_invalid_api_key_rejected(client: TestClient):
    """A malformed API key is rejected with 401."""
    resp = client.get("/api/v1/clients", headers={"X-API-Key": "not-a-real-key"})
    assert resp.status_code == 401, resp.text
