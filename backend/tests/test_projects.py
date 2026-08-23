"""Tests for project CRUD endpoints, multi-tenancy isolation, and GitHub stats exposure."""
from datetime import datetime, timezone
from uuid import UUID

from fastapi.testclient import TestClient

from app.models.github_cache import GitHubCache


# ── Helpers ──────────────────────────────────────────────────────────


def _register_and_get_token(client: TestClient, email: str, credential: str = "Test1234") -> str:
    """Register a user and return their JWT token."""
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


def _create_project(client: TestClient, token: str, client_id: str,
                     name: str = "Website Revamp", github_repo: str = None):
    payload = {"client_id": client_id, "name": name}
    if github_repo:
        payload["github_repo"] = github_repo
    resp = client.post("/api/v1/projects", json=payload, headers=_auth_headers(token))
    return resp


# ── Auth guard tests ─────────────────────────────────────────────────


def test_list_projects_unauthenticated(client: TestClient):
    resp = client.get("/api/v1/projects")
    assert resp.status_code == 401


def test_create_project_unauthenticated(client: TestClient):
    resp = client.post("/api/v1/projects", json={"client_id": "00000000-0000-0000-0000-000000000000", "name": "Ghost"})
    assert resp.status_code == 401


# ── CRUD tests ───────────────────────────────────────────────────────


def test_create_project_success(client: TestClient):
    token = _register_and_get_token(client, "user@test.com")
    client_id = _create_client(client, token)

    resp = _create_project(client, token, client_id)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Website Revamp"
    assert data["client_id"] == client_id
    assert data["status"] == "active"
    assert data["github_stats"] is None  # no GitHubCache row yet


def test_create_project_rejects_unowned_client(client: TestClient):
    """Creating a project under a client you don't own must fail, not silently succeed."""
    token_a = _register_and_get_token(client, "a@test.com")
    token_b = _register_and_get_token(client, "b@test.com")
    client_b_id = _create_client(client, token_b, name="B's Client", phone="+911000000010")

    resp = _create_project(client, token_a, client_b_id)
    assert resp.status_code == 404


def test_list_projects(client: TestClient):
    token = _register_and_get_token(client, "list@test.com")
    client_id = _create_client(client, token)
    _create_project(client, token, client_id, name="Project A")
    _create_project(client, token, client_id, name="Project B")

    resp = client.get("/api/v1/projects", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    names = {p["name"] for p in data}
    assert names == {"Project A", "Project B"}


def test_list_projects_filter_by_client_id(client: TestClient):
    token = _register_and_get_token(client, "filter@test.com")
    client_1 = _create_client(client, token, name="Client 1", phone="+911000000011")
    client_2 = _create_client(client, token, name="Client 2", phone="+911000000012")
    _create_project(client, token, client_1, name="P1")
    _create_project(client, token, client_2, name="P2")

    resp = client.get(f"/api/v1/projects?client_id={client_1}", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "P1"


def test_list_projects_filter_by_unowned_client_id_forbidden(client: TestClient):
    token_a = _register_and_get_token(client, "fa@test.com")
    token_b = _register_and_get_token(client, "fb@test.com")
    client_b_id = _create_client(client, token_b, name="B's Client", phone="+911000000013")

    resp = client.get(f"/api/v1/projects?client_id={client_b_id}", headers=_auth_headers(token_a))
    assert resp.status_code == 403


def test_get_project_by_id(client: TestClient):
    token = _register_and_get_token(client, "get@test.com")
    client_id = _create_client(client, token)
    project_id = _create_project(client, token, client_id).json()["id"]

    resp = client.get(f"/api/v1/projects/{project_id}", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["id"] == project_id


def test_update_project(client: TestClient):
    token = _register_and_get_token(client, "update@test.com")
    client_id = _create_client(client, token)
    project_id = _create_project(client, token, client_id).json()["id"]

    resp = client.put(
        f"/api/v1/projects/{project_id}",
        json={"name": "Renamed", "status": "paused"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"
    assert resp.json()["status"] == "paused"


def test_delete_project_is_soft_delete(client: TestClient):
    token = _register_and_get_token(client, "delete@test.com")
    client_id = _create_client(client, token)
    project_id = _create_project(client, token, client_id).json()["id"]

    resp = client.delete(f"/api/v1/projects/{project_id}", headers=_auth_headers(token))
    assert resp.status_code == 204

    resp = client.get(f"/api/v1/projects/{project_id}", headers=_auth_headers(token))
    assert resp.status_code == 404


# ── MULTI-TENANCY ISOLATION ──────────────────────────────────────────


def test_user_cannot_see_other_users_projects(client: TestClient):
    token_a = _register_and_get_token(client, "iso_list_a@test.com")
    token_b = _register_and_get_token(client, "iso_list_b@test.com")
    client_a_id = _create_client(client, token_a, name="A's Client", phone="+911000000020")
    client_b_id = _create_client(client, token_b, name="B's Client", phone="+911000000021")
    _create_project(client, token_a, client_a_id, name="A's Project")
    _create_project(client, token_b, client_b_id, name="B's Project")

    resp_a = client.get("/api/v1/projects", headers=_auth_headers(token_a))
    assert len(resp_a.json()) == 1
    assert resp_a.json()[0]["name"] == "A's Project"


def test_user_cannot_access_other_users_project_by_id(client: TestClient):
    token_a = _register_and_get_token(client, "iso_get_a@test.com")
    token_b = _register_and_get_token(client, "iso_get_b@test.com")
    client_b_id = _create_client(client, token_b, name="B's Client", phone="+911000000022")
    project_id = _create_project(client, token_b, client_b_id, name="Secret Project").json()["id"]

    resp = client.get(f"/api/v1/projects/{project_id}", headers=_auth_headers(token_a))
    assert resp.status_code == 404


def test_user_cannot_update_other_users_project(client: TestClient):
    token_a = _register_and_get_token(client, "iso_upd_a@test.com")
    token_b = _register_and_get_token(client, "iso_upd_b@test.com")
    client_b_id = _create_client(client, token_b, name="B's Client", phone="+911000000023")
    project_id = _create_project(client, token_b, client_b_id, name="B's Project").json()["id"]

    resp = client.put(
        f"/api/v1/projects/{project_id}",
        json={"name": "Hacked!"},
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 404


def test_user_cannot_delete_other_users_project(client: TestClient):
    token_a = _register_and_get_token(client, "iso_del_a@test.com")
    token_b = _register_and_get_token(client, "iso_del_b@test.com")
    client_b_id = _create_client(client, token_b, name="B's Client", phone="+911000000024")
    project_id = _create_project(client, token_b, client_b_id, name="B's Project").json()["id"]

    resp = client.delete(f"/api/v1/projects/{project_id}", headers=_auth_headers(token_a))
    assert resp.status_code == 404

    resp = client.get(f"/api/v1/projects/{project_id}", headers=_auth_headers(token_b))
    assert resp.status_code == 200


# ── GitHub stats nesting (Phase 2, Milestone 2) ──────────────────────


def test_github_stats_null_when_no_cache_row(client: TestClient):
    """A project with no github_cache row must return github_stats: null, not error."""
    token = _register_and_get_token(client, "nocache@test.com")
    client_id = _create_client(client, token, phone="+911000000030")
    project_id = _create_project(client, token, client_id, github_repo="acme/site").json()["id"]

    resp = client.get(f"/api/v1/projects/{project_id}", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["github_stats"] is None


def test_github_stats_populated_from_cache_row(client: TestClient, db_session):
    """When a github_cache row exists, it must be nested correctly on both GET and LIST."""
    token = _register_and_get_token(client, "withcache@test.com")
    client_id = _create_client(client, token, phone="+911000000031")
    project_id = _create_project(client, token, client_id, github_repo="acme/site").json()["id"]

    cache = GitHubCache(
        project_id=UUID(project_id),
        commits_count=42,
        commits_last_7_days=5,
        open_issues=3,
        closed_issues=10,
        pull_requests=2,
        last_commit_message="fix: bug",
        last_commit_date=datetime(2026, 7, 20, tzinfo=timezone.utc),
        progress_percent=67,
        synced_at=datetime(2026, 7, 25, tzinfo=timezone.utc),
    )
    db_session.add(cache)
    db_session.commit()

    resp = client.get(f"/api/v1/projects/{project_id}", headers=_auth_headers(token))
    assert resp.status_code == 200
    stats = resp.json()["github_stats"]
    assert stats is not None
    assert stats["commits_count"] == 42
    assert stats["commits_last_7_days"] == 5
    assert stats["open_issues"] == 3
    assert stats["closed_issues"] == 10
    assert stats["pull_requests"] == 2
    assert stats["last_commit_message"] == "fix: bug"
    assert stats["progress_percent"] == 67

    # Also nested correctly on the list endpoint (selectinload path)
    resp = client.get("/api/v1/projects", headers=_auth_headers(token))
    assert resp.status_code == 200
    listed = next(p for p in resp.json() if p["id"] == project_id)
    assert listed["github_stats"]["commits_count"] == 42
