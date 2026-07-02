"""Tests for plan-limit enforcement (F2).

These run without a seeded plans table, so the entitlement layer falls back
to the built-in Free plan limits (max_clients=5, max_projects=3).
"""
from fastapi.testclient import TestClient


def _register_and_get_token(client: TestClient, email: str, credential: str = "Test1234") -> str:
    client.post("/api/v1/auth/register", json={
        "email": email, "password": credential,
        "full_name": "Test User", "agency_name": "Test Agency",
    })
    resp = client.post("/api/v1/auth/login", data={"username": email, "password": credential})
    return resp.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_client_limit_enforced_on_free_plan(client: TestClient):
    """The 6th client on the Free plan (limit 5) must be rejected with 402."""
    token = _register_and_get_token(client, "limits@test.com")

    for i in range(5):
        resp = client.post(
            "/api/v1/clients",
            json={"name": f"Client {i}", "phone": f"+9198765432{i:02d}"},
            headers=_headers(token),
        )
        assert resp.status_code == 201, resp.text

    # 6th exceeds the free limit
    resp = client.post(
        "/api/v1/clients",
        json={"name": "Client 6", "phone": "+919000000006"},
        headers=_headers(token),
    )
    assert resp.status_code == 402, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "plan_limit_reached"
    assert detail["resource"] == "clients"
    assert detail["limit"] == 5


def test_project_limit_enforced_on_free_plan(client: TestClient):
    """The 4th project on the Free plan (limit 3) must be rejected with 402."""
    token = _register_and_get_token(client, "projlimits@test.com")

    c = client.post(
        "/api/v1/clients",
        json={"name": "Acme", "phone": "+919111111111"},
        headers=_headers(token),
    )
    client_id = c.json()["id"]

    for i in range(3):
        resp = client.post(
            "/api/v1/projects",
            json={"client_id": client_id, "name": f"Project {i}"},
            headers=_headers(token),
        )
        assert resp.status_code == 201, resp.text

    resp = client.post(
        "/api/v1/projects",
        json={"client_id": client_id, "name": "Project 4"},
        headers=_headers(token),
    )
    assert resp.status_code == 402, resp.text
    assert resp.json()["detail"]["resource"] == "projects"


def test_limits_are_per_tenant(client: TestClient):
    """One tenant hitting a limit must not affect another tenant."""
    token_a = _register_and_get_token(client, "tenant_a@test.com")
    token_b = _register_and_get_token(client, "tenant_b@test.com")

    for i in range(5):
        client.post(
            "/api/v1/clients",
            json={"name": f"A{i}", "phone": f"+9191111111{i:02d}"},
            headers=_headers(token_a),
        )
    # Tenant A is now at the limit; Tenant B should still be able to create.
    resp = client.post(
        "/api/v1/clients",
        json={"name": "B1", "phone": "+919222222222"},
        headers=_headers(token_b),
    )
    assert resp.status_code == 201, resp.text
