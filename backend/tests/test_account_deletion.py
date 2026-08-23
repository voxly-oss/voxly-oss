"""Integration tests for P0-1: DELETE /api/v1/auth/me.

See ACCOUNT_DELETION_DESIGN.md for the full root-cause analysis and the
dependency graph these tests are checking against. The bug this replaces
was invisible to SQLite (no FK enforcement without an explicit PRAGMA — see
conftest.py) so these tests are only meaningful run against the Postgres CI
lane (DATABASE_URL set); against the default in-memory SQLite fallback they
will pass identically whether the fix is present or not.
"""
import uuid
from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.models.api_key import APIKey
from app.models.chat_history import ChatHistory
from app.models.client import Client
from app.models.conversation_state import ConversationState
from app.models.github_cache import GitHubCache
from app.models.membership import Membership
from app.models.milestone import Milestone
from app.models.organization import Organization
from app.models.plan import Plan
from app.models.project import Project
from app.models.role import Role
from app.models.subscription import Subscription
from app.models.usage_log import UsageLog
from app.models.user import User
from app.models.user_ai_key import UserAIKey
from app.rate_limit import limiter


# ── Fixtures / helpers ──────────────────────────────────────────────────


@pytest.fixture
def dual_write_enabled():
    original = settings.DUAL_WRITE_ORGANIZATIONS_ENABLED
    settings.DUAL_WRITE_ORGANIZATIONS_ENABLED = True
    yield
    settings.DUAL_WRITE_ORGANIZATIONS_ENABLED = original


def _seed_owner_role(db_session) -> Role:
    role = Role(name="owner", org_id=None, permissions=["org:admin"], is_system=True)
    db_session.add(role)
    db_session.commit()
    db_session.refresh(role)
    return role


def _register_and_login(client: TestClient, email: str, password: str = "Test1234") -> dict:
    resp = client.post("/api/v1/auth/register", json={
        "email": email, "password": password, "full_name": "Test User", "agency_name": "Acme",
    })
    assert resp.status_code == 201, resp.text
    login = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, uuid.UUID(resp.json()["id"])


def _create_client(client: TestClient, headers: dict, phone: str, name: str = "Acme Corp") -> str:
    resp = client.post("/api/v1/clients", json={"name": name, "phone": phone}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_project(client: TestClient, headers: dict, client_id: str, name: str = "Website") -> str:
    resp = client.post(
        "/api/v1/projects", json={"client_id": client_id, "name": name}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ── Baseline: flag off, no organization involved ────────────────────────


def test_delete_account_no_org_baseline(client: TestClient, db_session):
    """The one path that already worked before the fix — must keep working."""
    assert settings.DUAL_WRITE_ORGANIZATIONS_ENABLED is False
    headers, user_id = _register_and_login(client, f"baseline-{uuid.uuid4().hex[:8]}@example.com")
    client_id = _create_client(client, headers, phone="+911800000001")
    _create_project(client, headers, client_id)

    resp = client.delete("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 204

    assert db_session.query(User).filter(User.id == user_id).count() == 0
    assert db_session.query(Client).filter(Client.user_id == user_id).count() == 0
    assert db_session.query(Project).filter(Project.client_id == uuid.UUID(client_id)).count() == 0


# ── Layer 1: org exists, nothing else does ───────────────────────────────


def test_delete_account_layer1_org_with_no_data(client: TestClient, db_session, dual_write_enabled):
    """Reproduces the exact production failure: registering alone (with the
    dual-write flag on) self-heals an Organization with zero clients/projects
    under it. The original code 500'd here unconditionally."""
    _seed_owner_role(db_session)
    headers, user_id = _register_and_login(client, f"layer1-{uuid.uuid4().hex[:8]}@example.com")

    org = db_session.query(Organization).filter(Organization.owner_user_id == user_id).one()
    org_id = org.id

    resp = client.delete("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 204

    assert db_session.query(User).filter(User.id == user_id).count() == 0
    assert db_session.query(Organization).filter(Organization.id == org_id).count() == 0
    assert db_session.query(Membership).filter(Membership.org_id == org_id).count() == 0


# ── Layer 2: org has real client/project data referencing it ────────────


def test_delete_account_layer2_with_clients_and_projects(client: TestClient, db_session, dual_write_enabled):
    """The case a Layer-1-only fix (e.g. `db.delete(org); db.delete(user)`)
    would still fail on: clients.org_id / projects.org_id are populated by
    the real dual-write path and must be cleared before the org itself can
    be deleted."""
    _seed_owner_role(db_session)
    headers, user_id = _register_and_login(client, f"layer2-{uuid.uuid4().hex[:8]}@example.com")
    org = db_session.query(Organization).filter(Organization.owner_user_id == user_id).one()
    org_id = org.id

    client_id = _create_client(client, headers, phone="+911800000002")
    project_id = _create_project(client, headers, client_id)

    # Confirm the dual-write actually populated org_id — otherwise this test
    # wouldn't be exercising Layer 2 at all.
    db_client = db_session.query(Client).filter(Client.id == uuid.UUID(client_id)).one()
    db_project = db_session.query(Project).filter(Project.id == uuid.UUID(project_id)).one()
    assert db_client.org_id == org_id
    assert db_project.org_id == org_id

    resp = client.delete("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 204

    assert db_session.query(User).filter(User.id == user_id).count() == 0
    assert db_session.query(Organization).filter(Organization.id == org_id).count() == 0
    assert db_session.query(Client).filter(Client.id == uuid.UUID(client_id)).count() == 0
    assert db_session.query(Project).filter(Project.id == uuid.UUID(project_id)).count() == 0


# ── The specific gap the pre-implementation review caught (§15.2) ───────


def test_delete_account_clears_usage_log_with_null_api_key_id(client: TestClient, db_session, dual_write_enabled):
    """usage_logs.org_id is RESTRICT and a row can have api_key_id NULL (usage
    not tied to a specific key). Such a row is not reached by clearing
    Client/APIKey alone and must be cleared explicitly, or Organization
    deletion fails on this constraint specifically."""
    _seed_owner_role(db_session)
    headers, user_id = _register_and_login(client, f"usagelog-{uuid.uuid4().hex[:8]}@example.com")
    org = db_session.query(Organization).filter(Organization.owner_user_id == user_id).one()

    log = UsageLog(
        user_id=user_id, org_id=org.id, api_key_id=None,
        date=date.today(), endpoint="/api/v1/clients", method="GET", request_count=3,
    )
    db_session.add(log)
    db_session.commit()

    resp = client.delete("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 204

    assert db_session.query(UsageLog).filter(UsageLog.user_id == user_id).count() == 0
    assert db_session.query(Organization).filter(Organization.owner_user_id == user_id).count() == 0


# ── 409 guard: org has another member (constructed directly — no ─────────
# ── invitation-acceptance flow exists yet to reach this via the API) ────


def test_delete_account_409_when_org_has_other_member(client: TestClient, db_session, dual_write_enabled):
    owner_role = _seed_owner_role(db_session)
    headers, owner_id = _register_and_login(client, f"shared-owner-{uuid.uuid4().hex[:8]}@example.com")
    org = db_session.query(Organization).filter(Organization.owner_user_id == owner_id).one()
    org_id = org.id

    other_user = User(
        email=f"shared-member-{uuid.uuid4().hex[:8]}@example.com",
        password_hash="x", full_name="Other Member",
    )
    db_session.add(other_user)
    db_session.commit()
    db_session.add(Membership(org_id=org_id, user_id=other_user.id, role_id=owner_role.id, status="active"))
    db_session.commit()

    resp = client.delete("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 409

    # Nothing was deleted — the guard must fire before any destructive
    # statement, not partially through the transaction.
    assert db_session.query(User).filter(User.id == owner_id).count() == 1
    assert db_session.query(Organization).filter(Organization.id == org_id).count() == 1
    assert db_session.query(Membership).filter(Membership.org_id == org_id).count() == 2


# ── Full dependency graph: one positive assertion per §6 edge ───────────


def test_delete_account_removes_every_dependent_row(client: TestClient, db_session, dual_write_enabled):
    _seed_owner_role(db_session)
    headers, user_id = _register_and_login(client, f"fullgraph-{uuid.uuid4().hex[:8]}@example.com")
    org = db_session.query(Organization).filter(Organization.owner_user_id == user_id).one()
    org_id = org.id

    client_id_str = _create_client(client, headers, phone="+911800000003")
    project_id = uuid.UUID(_create_project(client, headers, client_id_str, name="Full Graph Project"))
    client_id = uuid.UUID(client_id_str)

    key_resp = client.post(
        "/api/v1/api-keys/", json={"label": "K1", "scopes": []}, headers=headers
    )
    assert key_resp.status_code == 201, key_resp.text
    api_key_id = uuid.UUID(key_resp.json()["id"])

    ai_resp = client.post(
        "/api/v1/ai-keys/",
        json={"provider": "gemini", "api_key": "fake-key-1234567890"},
        headers=headers,
    )
    assert ai_resp.status_code == 201, ai_resp.text

    plan = Plan(name=f"Pro-{uuid.uuid4().hex[:6]}", slug=f"pro-{uuid.uuid4().hex[:6]}")
    db_session.add(plan)
    db_session.commit()
    db_session.add(Subscription(user_id=user_id, org_id=org_id, plan_id=plan.id, status="active"))
    db_session.add(UsageLog(
        user_id=user_id, org_id=org_id, api_key_id=api_key_id,
        date=date.today(), endpoint="/api/v1/projects", method="POST", request_count=1,
    ))
    db_session.add(Milestone(project_id=project_id, title="Kickoff", status="pending"))
    db_session.add(GitHubCache(
        project_id=project_id, commits_count=5, commits_last_7_days=2, open_issues=1,
        closed_issues=0, pull_requests=0, progress_percent=10,
        synced_at=datetime.now(timezone.utc),
    ))
    db_session.add(ChatHistory(
        client_id=client_id, project_id=project_id, message="hi", response="hello", channel="whatsapp",
    ))
    db_session.add(ConversationState(client_id=client_id, status="ai_handling"))
    db_session.commit()

    resp = client.delete("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 204

    assert db_session.query(User).filter(User.id == user_id).count() == 0
    assert db_session.query(Organization).filter(Organization.id == org_id).count() == 0
    assert db_session.query(Membership).filter(Membership.org_id == org_id).count() == 0
    assert db_session.query(Client).filter(Client.id == client_id).count() == 0
    assert db_session.query(Project).filter(Project.id == project_id).count() == 0
    assert db_session.query(APIKey).filter(APIKey.user_id == user_id).count() == 0
    assert db_session.query(UserAIKey).filter(UserAIKey.user_id == user_id).count() == 0
    assert db_session.query(Subscription).filter(Subscription.user_id == user_id).count() == 0
    assert db_session.query(UsageLog).filter(UsageLog.user_id == user_id).count() == 0
    assert db_session.query(Milestone).filter(Milestone.project_id == project_id).count() == 0
    assert db_session.query(GitHubCache).filter(GitHubCache.project_id == project_id).count() == 0
    assert db_session.query(ChatHistory).filter(ChatHistory.client_id == client_id).count() == 0
    assert db_session.query(ConversationState).filter(ConversationState.client_id == client_id).count() == 0

    # The Plan is global reference data — must survive (§6 "dead ends").
    assert db_session.query(Plan).filter(Plan.id == plan.id).count() == 1


# ── Rate limiter decorator still wired correctly ─────────────────────────


def test_delete_account_rate_limit_decorator_still_wired(client: TestClient):
    """conftest.py's autouse fixture disables the limiter for every test, and
    slowapi skips its own request-parameter inspection entirely when
    disabled — so this needs the limiter re-enabled to mean anything (same
    pattern as test_ai_chat.py::test_admin_chat_returns_200_not_500). Proves
    the rewritten endpoint still has a correctly-named `request: Request`
    parameter for @limiter.limit to find, not just that it works when
    rate limiting is off."""
    headers, _ = _register_and_login(client, f"ratelimit-{uuid.uuid4().hex[:8]}@example.com")
    limiter.enabled = True

    resp = client.delete("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 204
