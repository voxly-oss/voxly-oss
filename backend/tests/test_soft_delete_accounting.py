"""Tests that soft-deleted clients/projects never count toward dashboard
stats or plan usage/quota.

Regression guard for BUG-07 in PRODUCTION_ACCEPTANCE_REPORT.md: dashboard
stats and billing usage counted soft-deleted clients (and projects), so a
Free-plan user (5-client limit) who created and deleted clients could be
quota-locked out of an allowance they weren't actually using, and the
dashboard reported more clients than GET /clients ever returned.
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


def _create_client(client: TestClient, token: str, name: str = "Acme Corp",
                    phone: str = "+919876543210"):
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


def test_dashboard_excludes_soft_deleted_clients(client: TestClient):
    token = _register_and_get_token(client, "sd1@test.com")
    keep_id = _create_client(client, token, name="Keep Me", phone="+919000000001")
    gone_id = _create_client(client, token, name="Delete Me", phone="+919000000002")

    before = client.get("/api/v1/dashboard/stats", headers=_auth_headers(token)).json()
    assert before["total_clients"] == 2

    del_resp = client.delete(f"/api/v1/clients/{gone_id}", headers=_auth_headers(token))
    assert del_resp.status_code == 204

    after = client.get("/api/v1/dashboard/stats", headers=_auth_headers(token)).json()
    assert after["total_clients"] == 1

    # Matches what the client list itself reports -- the whole point of the fix.
    listed = client.get("/api/v1/clients", headers=_auth_headers(token)).json()
    assert len(listed) == after["total_clients"] == 1
    assert listed[0]["id"] == keep_id


def test_dashboard_excludes_soft_deleted_projects(client: TestClient):
    token = _register_and_get_token(client, "sd2@test.com")
    client_id = _create_client(client, token)
    keep_id = _create_project(client, token, client_id, name="Keep")
    gone_id = _create_project(client, token, client_id, name="Gone")

    before = client.get("/api/v1/dashboard/stats", headers=_auth_headers(token)).json()
    assert before["total_projects"] == 2

    del_resp = client.delete(f"/api/v1/projects/{gone_id}", headers=_auth_headers(token))
    assert del_resp.status_code == 204

    after = client.get("/api/v1/dashboard/stats", headers=_auth_headers(token)).json()
    assert after["total_projects"] == 1


def test_usage_stats_excludes_soft_deleted_clients(client: TestClient):
    token = _register_and_get_token(client, "sd3@test.com")
    _create_client(client, token, name="Keep Me", phone="+919000000003")
    gone_id = _create_client(client, token, name="Delete Me", phone="+919000000004")

    client.delete(f"/api/v1/clients/{gone_id}", headers=_auth_headers(token))

    usage = client.get("/api/v1/billing/usage", headers=_auth_headers(token)).json()
    assert usage["clients_count"] == 1


def test_usage_stats_excludes_soft_deleted_projects(client: TestClient):
    token = _register_and_get_token(client, "sd4@test.com")
    client_id = _create_client(client, token)
    _create_project(client, token, client_id, name="Keep")
    gone_id = _create_project(client, token, client_id, name="Gone")

    client.delete(f"/api/v1/projects/{gone_id}", headers=_auth_headers(token))

    usage = client.get("/api/v1/billing/usage", headers=_auth_headers(token)).json()
    assert usage["projects_count"] == 1
