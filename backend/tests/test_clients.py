"""Tests for client CRUD endpoints and multi-tenancy isolation."""
import pytest
from fastapi.testclient import TestClient


# ── Helpers ──────────────────────────────────────────────────────────


def _register_and_get_token(client: TestClient, email: str, password: str = "Test1234") -> str:
    """Register a user and return their JWT token."""
    client.post("/api/v1/auth/register", json={
        "email": email,
        "password": password,
        "full_name": "Test User",
        "agency_name": "Test Agency",
    })
    resp = client.post("/api/v1/auth/login", data={
        "username": email,
        "password": password,
    })
    return resp.json()["access_token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_client(client: TestClient, token: str, name: str = "Acme Corp",
                   phone: str = "+919876543210", email: str = "acme@example.com"):
    """Create a client and return the response JSON."""
    resp = client.post(
        "/api/v1/clients",
        json={"name": name, "phone": phone, "email": email, "company": "Acme Inc"},
        headers=_auth_headers(token),
    )
    return resp


# ── Auth guard tests ─────────────────────────────────────────────────


def test_list_clients_unauthenticated(client: TestClient):
    """Unauthenticated requests should be rejected."""
    resp = client.get("/api/v1/clients")
    assert resp.status_code == 401


def test_create_client_unauthenticated(client: TestClient):
    """Unauthenticated create should be rejected."""
    resp = client.post("/api/v1/clients", json={
        "name": "Ghost", "phone": "+910000000000",
    })
    assert resp.status_code == 401


# ── CRUD tests ───────────────────────────────────────────────────────


def test_create_client_success(client: TestClient):
    """Authenticated user can create a client."""
    token = _register_and_get_token(client, "user@test.com")
    resp = _create_client(client, token)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Acme Corp"
    assert data["phone"] == "+919876543210"
    assert "id" in data
    assert "user_id" in data


def test_list_clients(client: TestClient):
    """User should see only their own clients."""
    token = _register_and_get_token(client, "list@test.com")
    _create_client(client, token, name="Client A", phone="+911111111111")
    _create_client(client, token, name="Client B", phone="+912222222222")

    resp = client.get("/api/v1/clients", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    names = {c["name"] for c in data}
    assert names == {"Client A", "Client B"}


def test_get_client_by_id(client: TestClient):
    """User can fetch a specific client by ID."""
    token = _register_and_get_token(client, "get@test.com")
    create_resp = _create_client(client, token)
    client_id = create_resp.json()["id"]

    resp = client.get(f"/api/v1/clients/{client_id}", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["id"] == client_id


def test_update_client(client: TestClient):
    """User can update their client's details."""
    token = _register_and_get_token(client, "update@test.com")
    create_resp = _create_client(client, token)
    client_id = create_resp.json()["id"]

    resp = client.put(
        f"/api/v1/clients/{client_id}",
        json={"name": "Updated Name", "company": "New Corp"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"
    assert resp.json()["company"] == "New Corp"


def test_delete_client(client: TestClient):
    """User can delete their client."""
    token = _register_and_get_token(client, "delete@test.com")
    create_resp = _create_client(client, token)
    client_id = create_resp.json()["id"]

    resp = client.delete(f"/api/v1/clients/{client_id}", headers=_auth_headers(token))
    assert resp.status_code == 204

    # Verify it's gone
    resp = client.get(f"/api/v1/clients/{client_id}", headers=_auth_headers(token))
    assert resp.status_code == 404


def test_duplicate_phone_rejected(client: TestClient):
    """Creating two clients with the same phone should fail."""
    token = _register_and_get_token(client, "dup@test.com")
    _create_client(client, token, phone="+919999999999")
    resp = _create_client(client, token, name="Duplicate", phone="+919999999999")
    assert resp.status_code == 400
    assert "phone" in resp.json()["detail"].lower()


# ── MULTI-TENANCY ISOLATION (CRITICAL) ───────────────────────────────


def test_user_cannot_see_other_users_clients(client: TestClient):
    """User A must NOT be able to see User B's clients."""
    token_a = _register_and_get_token(client, "agency_a@test.com")
    token_b = _register_and_get_token(client, "agency_b@test.com")

    # User A creates a client
    _create_client(client, token_a, name="A's Client", phone="+911000000001")

    # User B creates a client
    _create_client(client, token_b, name="B's Client", phone="+911000000002")

    # User A should only see their own client
    resp_a = client.get("/api/v1/clients", headers=_auth_headers(token_a))
    assert len(resp_a.json()) == 1
    assert resp_a.json()[0]["name"] == "A's Client"

    # User B should only see their own client
    resp_b = client.get("/api/v1/clients", headers=_auth_headers(token_b))
    assert len(resp_b.json()) == 1
    assert resp_b.json()[0]["name"] == "B's Client"


def test_user_cannot_access_other_users_client_by_id(client: TestClient):
    """User A must NOT be able to GET User B's client by ID."""
    token_a = _register_and_get_token(client, "iso_a@test.com")
    token_b = _register_and_get_token(client, "iso_b@test.com")

    # User B creates a client
    create_resp = _create_client(client, token_b, name="Secret Client", phone="+911000000003")
    secret_id = create_resp.json()["id"]

    # User A tries to access User B's client — must get 404
    resp = client.get(f"/api/v1/clients/{secret_id}", headers=_auth_headers(token_a))
    assert resp.status_code == 404


def test_user_cannot_update_other_users_client(client: TestClient):
    """User A must NOT be able to UPDATE User B's client."""
    token_a = _register_and_get_token(client, "upd_a@test.com")
    token_b = _register_and_get_token(client, "upd_b@test.com")

    create_resp = _create_client(client, token_b, name="B's Private", phone="+911000000004")
    client_id = create_resp.json()["id"]

    # User A tries to update User B's client — must get 404
    resp = client.put(
        f"/api/v1/clients/{client_id}",
        json={"name": "Hacked!"},
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 404


def test_user_cannot_delete_other_users_client(client: TestClient):
    """User A must NOT be able to DELETE User B's client."""
    token_a = _register_and_get_token(client, "del_a@test.com")
    token_b = _register_and_get_token(client, "del_b@test.com")

    create_resp = _create_client(client, token_b, name="B's Protected", phone="+911000000005")
    client_id = create_resp.json()["id"]

    # User A tries to delete User B's client — must get 404
    resp = client.delete(f"/api/v1/clients/{client_id}", headers=_auth_headers(token_a))
    assert resp.status_code == 404

    # Verify it still exists for User B
    resp = client.get(f"/api/v1/clients/{client_id}", headers=_auth_headers(token_b))
    assert resp.status_code == 200
