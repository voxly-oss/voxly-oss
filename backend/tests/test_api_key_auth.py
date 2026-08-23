"""Tests that an active API key actually authenticates requests.

Regression guard for BUG-05 / F-37 in PRODUCTION_ACCEPTANCE_REPORT.md:
app/utils/api_key_auth.py defined get_current_user_or_api_key(), but it was
attached to no route -- a brand-new active key sent as X-API-Key against
GET /api/v1/clients returned 401 everywhere, while /settings/api-keys told
users to "start making programmatic requests to the Voxly API." The fix
wires the dual-auth dependency (and a tenant-context variant that resolves
through it) onto clients/projects/milestones.
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


def _create_api_key(client: TestClient, token: str, label: str = "CI Key") -> str:
    resp = client.post(
        "/api/v1/api-keys/", json={"label": label, "scopes": []}, headers=_auth_headers(token)
    )
    assert resp.status_code == 201
    return resp.json()["key"]


def test_active_api_key_authenticates_list_clients(client: TestClient):
    jwt = _register_and_get_token(client, "ak1@test.com")
    api_key = _create_api_key(client, jwt)

    resp = client.get("/api/v1/clients", headers={"X-API-Key": api_key})
    assert resp.status_code == 200


def test_active_api_key_authenticates_create_client(client: TestClient):
    jwt = _register_and_get_token(client, "ak2@test.com")
    api_key = _create_api_key(client, jwt)

    resp = client.post(
        "/api/v1/clients",
        json={"name": "Via API Key", "phone": "+919812345678", "email": "viakey@example.com"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Via API Key"


def test_api_key_scoped_to_its_own_owner(client: TestClient):
    """A key minted by user A must never see user B's clients."""
    jwt_a = _register_and_get_token(client, "ak3a@test.com")
    api_key_a = _create_api_key(client, jwt_a)
    client.post(
        "/api/v1/clients",
        json={"name": "Owner A Client", "phone": "+919800000001", "email": "a@example.com"},
        headers={"X-API-Key": api_key_a},
    )

    jwt_b = _register_and_get_token(client, "ak3b@test.com")
    client.post(
        "/api/v1/clients",
        json={"name": "Owner B Client", "phone": "+919800000002", "email": "b@example.com"},
        headers=_auth_headers(jwt_b),
    )

    resp = client.get("/api/v1/clients", headers={"X-API-Key": api_key_a})
    assert resp.status_code == 200
    names = {c["name"] for c in resp.json()}
    assert names == {"Owner A Client"}


def test_revoked_api_key_is_rejected(client: TestClient):
    jwt = _register_and_get_token(client, "ak4@test.com")
    create_resp = client.post(
        "/api/v1/api-keys/", json={"label": "To Revoke", "scopes": []}, headers=_auth_headers(jwt)
    )
    key_id = create_resp.json()["id"]
    api_key = create_resp.json()["key"]

    revoke_resp = client.delete(f"/api/v1/api-keys/{key_id}", headers=_auth_headers(jwt))
    assert revoke_resp.status_code == 200

    resp = client.get("/api/v1/clients", headers={"X-API-Key": api_key})
    assert resp.status_code == 401


def test_malformed_api_key_is_rejected(client: TestClient):
    resp = client.get("/api/v1/clients", headers={"X-API-Key": "not-a-real-key"})
    assert resp.status_code == 401


def test_jwt_still_works_on_dual_auth_routes(client: TestClient):
    """Wiring in API-key auth must not break the existing JWT path."""
    jwt = _register_and_get_token(client, "ak5@test.com")
    resp = client.get("/api/v1/clients", headers=_auth_headers(jwt))
    assert resp.status_code == 200
