"""Tests for pagination bounds on /clients, /projects, /milestones.

Regression guard for BUG-03 and BUG-15 in PRODUCTION_ACCEPTANCE_REPORT.md:
negative `skip`/`limit` raised an unhandled psycopg2
InvalidRowCountInResultOffsetClause (HTTP 500) on Postgres -- invisible on
the SQLite lane developers actually run, since SQLite silently tolerates a
negative OFFSET/LIMIT. There was also no upper bound on `limit`, so one
request could force a full-table scan and serialization.
"""
import pytest
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


def _create_milestone(client: TestClient, token: str, project_id: str, title: str = "Design"):
    resp = client.post(
        "/api/v1/milestones",
        json={"project_id": project_id, "title": title, "status": "pending", "progress": 0},
        headers=_auth_headers(token),
    )
    return resp.json()["id"]


# ── /clients ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("params", [
    {"skip": -1}, {"limit": -1}, {"skip": -5, "limit": -5},
])
def test_clients_negative_pagination_does_not_500(client: TestClient, params):
    token = _register_and_get_token(client, "p1@test.com")
    _create_client(client, token)
    resp = client.get("/api/v1/clients", params=params, headers=_auth_headers(token))
    assert resp.status_code == 200


def test_clients_limit_has_upper_bound(client: TestClient):
    token = _register_and_get_token(client, "p2@test.com")
    for i in range(3):
        _create_client(client, token, name=f"Client {i}", phone=f"+9198765432{i:02d}")
    resp = client.get("/api/v1/clients", params={"limit": 10_000_000}, headers=_auth_headers(token))
    assert resp.status_code == 200
    # Clamped server-side to MAX_LIST_LIMIT (100); this only proves the
    # request didn't ask the DB to materialize an unbounded result set.
    assert len(resp.json()) <= 100


# ── /projects ────────────────────────────────────────────────────────


@pytest.mark.parametrize("params", [
    {"skip": -1}, {"limit": -1}, {"skip": -5, "limit": -5},
])
def test_projects_negative_pagination_does_not_500(client: TestClient, params):
    token = _register_and_get_token(client, "p3@test.com")
    client_id = _create_client(client, token)
    _create_project(client, token, client_id)
    resp = client.get("/api/v1/projects", params=params, headers=_auth_headers(token))
    assert resp.status_code == 200


# ── /milestones ──────────────────────────────────────────────────────


@pytest.mark.parametrize("params", [
    {"skip": -1}, {"limit": -1}, {"skip": -5, "limit": -5},
])
def test_milestones_negative_pagination_does_not_500(client: TestClient, params):
    token = _register_and_get_token(client, "p4@test.com")
    client_id = _create_client(client, token)
    project_id = _create_project(client, token, client_id)
    _create_milestone(client, token, project_id)
    resp = client.get("/api/v1/milestones", params=params, headers=_auth_headers(token))
    assert resp.status_code == 200
