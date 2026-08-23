"""Tests for GitHub context exposure on conversation endpoints (Phase 3 Milestone 5).

Verifies github_stats is sourced from the existing github_cache table (Phase 2's
Project.github_stats source) — no new fetch, no fabricated data, None when
nothing real exists to report.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi.testclient import TestClient

from app.api.v1.chat import _to_github_stats
from app.models.github_cache import GitHubCache


# ── Helpers ──────────────────────────────────────────────────────────


def _register_and_get_token(client: TestClient, email: str, credential: str = "Test1234") -> str:
    client.post("/api/v1/auth/register", json={
        "email": email, "password": credential,
        "full_name": "Test User", "agency_name": "Test Agency",
    })
    resp = client.post("/api/v1/auth/login", data={"username": email, "password": credential})
    return resp.json()["access_token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_client(client: TestClient, token: str, phone: str, name: str = "Acme Corp"):
    resp = client.post(
        "/api/v1/clients",
        json={"name": name, "phone": phone, "email": "acme@example.com"},
        headers=_auth_headers(token),
    )
    return resp.json()["id"]


def _create_project(client: TestClient, token: str, client_id: str, name: str = "Website",
                     github_repo: str = "acme/site", status: str = "active"):
    resp = client.post(
        "/api/v1/projects",
        json={"client_id": client_id, "name": name, "github_repo": github_repo, "status": status},
        headers=_auth_headers(token),
    )
    return resp.json()["id"]


def _add_cache_row(db_session, project_id: str, **overrides) -> GitHubCache:
    defaults = dict(
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
    defaults.update(overrides)
    cache = GitHubCache(**defaults)
    db_session.add(cache)
    db_session.commit()
    return cache


def _add_chat_row(db_session, client_id: str):
    from app.models.chat_history import ChatHistory
    row = ChatHistory(
        client_id=UUID(client_id),
        message="hi",
        response="hello",
        channel="whatsapp",
        created_at=datetime.utcnow(),
    )
    db_session.add(row)
    db_session.commit()
    return row


# ── Unit: _to_github_stats ────────────────────────────────────────────


def test_to_github_stats_none_when_no_cache():
    assert _to_github_stats(None) is None


def test_to_github_stats_maps_real_fields(client: TestClient, db_session):
    token = _register_and_get_token(client, "ghstatsfields@test.com")
    client_id = _create_client(client, token, phone="+911700000099")
    project_id = _create_project(client, token, client_id)
    cache = _add_cache_row(db_session, project_id, commits_count=99)
    result = _to_github_stats(cache)
    assert result is not None
    assert result.commits_count == 99
    assert result.progress_percent == 67


# ── GET /history/{client_id}: github_stats ────────────────────────────


def test_history_github_stats_none_without_sync(client: TestClient):
    """A project with a github_repo but no sync run yet -> None, not fabricated."""
    token = _register_and_get_token(client, "histgh1@test.com")
    client_id = _create_client(client, token, phone="+911700000001")
    _create_project(client, token, client_id)

    resp = client.get(f"/api/v1/chat/history/{client_id}", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["github_stats"] is None


def test_history_github_stats_populated_from_existing_cache(client: TestClient, db_session):
    token = _register_and_get_token(client, "histgh2@test.com")
    client_id = _create_client(client, token, phone="+911700000002")
    project_id = _create_project(client, token, client_id)
    _add_cache_row(db_session, project_id, commits_count=77, progress_percent=50)

    resp = client.get(f"/api/v1/chat/history/{client_id}", headers=_auth_headers(token))
    assert resp.status_code == 200
    stats = resp.json()["github_stats"]
    assert stats is not None
    assert stats["commits_count"] == 77
    assert stats["progress_percent"] == 50


def test_history_github_stats_none_when_no_project(client: TestClient):
    token = _register_and_get_token(client, "histgh3@test.com")
    client_id = _create_client(client, token, phone="+911700000003")
    # no project created at all

    resp = client.get(f"/api/v1/chat/history/{client_id}", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["github_stats"] is None


# ── GET /conversations: github_stats ──────────────────────────────────


def test_conversations_github_stats_populated(client: TestClient, db_session):
    token = _register_and_get_token(client, "convgh1@test.com")
    client_id = _create_client(client, token, phone="+911700000004")
    project_id = _create_project(client, token, client_id)
    _add_cache_row(db_session, project_id, open_issues=9)
    _add_chat_row(db_session, client_id)

    resp = client.get("/api/v1/chat/conversations", headers=_auth_headers(token))
    assert resp.status_code == 200
    convo = resp.json()["conversations"][0]
    assert convo["github_stats"] is not None
    assert convo["github_stats"]["open_issues"] == 9


def test_conversations_github_stats_none_without_project(client: TestClient, db_session):
    token = _register_and_get_token(client, "convgh2@test.com")
    client_id = _create_client(client, token, phone="+911700000005")
    _add_chat_row(db_session, client_id)  # message exists, but no project at all

    resp = client.get("/api/v1/chat/conversations", headers=_auth_headers(token))
    convo = resp.json()["conversations"][0]
    assert convo["github_stats"] is None


def test_conversations_multiple_clients_get_correct_own_stats(client: TestClient, db_session):
    """Each conversation must show ITS OWN project's stats, never another
    client's — the batched Milestone 5 lookup must not cross-wire results."""
    token = _register_and_get_token(client, "convgh3@test.com")
    client_a = _create_client(client, token, phone="+911700000006", name="A")
    client_b = _create_client(client, token, phone="+911700000007", name="B")
    project_a = _create_project(client, token, client_a, name="Proj A")
    project_b = _create_project(client, token, client_b, name="Proj B")
    _add_cache_row(db_session, project_a, commits_count=111)
    _add_cache_row(db_session, project_b, commits_count=222)
    _add_chat_row(db_session, client_a)
    _add_chat_row(db_session, client_b)

    resp = client.get("/api/v1/chat/conversations", headers=_auth_headers(token))
    data = resp.json()
    by_name = {c["client_name"]: c for c in data["conversations"]}
    assert by_name["A"]["github_stats"]["commits_count"] == 111
    assert by_name["B"]["github_stats"]["commits_count"] == 222


# ── Tenant isolation ───────────────────────────────────────────────────


def test_github_stats_not_leaked_cross_tenant(client: TestClient, db_session):
    """User A must never see User B's project's github_stats, even indirectly."""
    token_a = _register_and_get_token(client, "isoghA@test.com")
    token_b = _register_and_get_token(client, "isoghB@test.com")
    client_a = _create_client(client, token_a, phone="+911700000008", name="A's client")
    client_b = _create_client(client, token_b, phone="+911700000009", name="B's client")
    project_a = _create_project(client, token_a, client_a)
    project_b = _create_project(client, token_b, client_b)
    _add_cache_row(db_session, project_a, commits_count=1)
    _add_cache_row(db_session, project_b, commits_count=999999)
    _add_chat_row(db_session, client_a)
    _add_chat_row(db_session, client_b)

    resp = client.get("/api/v1/chat/conversations", headers=_auth_headers(token_a))
    data = resp.json()
    assert len(data["conversations"]) == 1
    assert data["conversations"][0]["github_stats"]["commits_count"] == 1


# ── Authorization ──────────────────────────────────────────────────────


def test_conversations_github_stats_requires_auth(client: TestClient):
    resp = client.get("/api/v1/chat/conversations")
    assert resp.status_code == 401


def test_history_github_stats_requires_ownership(client: TestClient, db_session):
    token_a = _register_and_get_token(client, "ownA@test.com")
    token_b = _register_and_get_token(client, "ownB@test.com")
    client_b = _create_client(client, token_b, phone="+911700000010")
    project_b = _create_project(client, token_b, client_b)
    _add_cache_row(db_session, project_b, commits_count=5)

    resp = client.get(f"/api/v1/chat/history/{client_b}", headers=_auth_headers(token_a))
    assert resp.status_code == 404
