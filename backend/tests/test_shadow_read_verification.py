"""Tests for shadow-read verification wired into the five real list
endpoints (clients, projects, milestones, api_keys, ai_keys) as Milestone 4
Step 1 (ORGANIZATION_FIRST_ARCHITECTURE.md §15). shadow_verify_read() itself
was built and tested in isolation during Milestone 3 but was never actually
called from a real read path until now -- these tests prove the wiring,
not the already-tested function body.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.models.client import Client
from app.models.organization import Organization
from app.models.role import Role
from app.models.user import User
from app.utils import tenant_metrics


# ── Fixtures / helpers ──────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_metrics():
    tenant_metrics.metrics.reset()
    yield
    tenant_metrics.metrics.reset()


@pytest.fixture
def dual_write_enabled():
    original = settings.DUAL_WRITE_ORGANIZATIONS_ENABLED
    settings.DUAL_WRITE_ORGANIZATIONS_ENABLED = True
    yield
    settings.DUAL_WRITE_ORGANIZATIONS_ENABLED = original


@pytest.fixture
def shadow_verify_enabled():
    original = settings.DUAL_READ_SHADOW_VERIFY_ENABLED
    settings.DUAL_READ_SHADOW_VERIFY_ENABLED = True
    yield
    settings.DUAL_READ_SHADOW_VERIFY_ENABLED = original


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
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


# ── Both flags off (today's real default): true no-op ───────────────────


def test_shadow_verify_is_noop_with_both_flags_off(client: TestClient, db_session):
    """Neither flag is on by default in this codebase -- confirms wiring
    the calls in did not accidentally make them fire unconditionally."""
    assert settings.DUAL_WRITE_ORGANIZATIONS_ENABLED is False
    assert settings.DUAL_READ_SHADOW_VERIFY_ENABLED is False
    headers = _register_and_login(client, f"noop-{uuid.uuid4().hex[:8]}@example.com")

    client.post("/api/v1/clients", json={"name": "C1", "phone": "+919000000001"}, headers=headers)
    client.get("/api/v1/clients", headers=headers)
    client.get("/api/v1/projects", headers=headers)
    client.get("/api/v1/milestones", headers=headers)
    client.get("/api/v1/api-keys/", headers=headers)
    client.get("/api/v1/ai-keys/", headers=headers)

    snap = tenant_metrics.metrics.snapshot()
    assert snap["shadow_read_count"] == 0
    assert snap["shadow_read_mismatch_count"] == 0


# ── Both flags on, consistent data: real comparisons, zero mismatches ───


def test_shadow_verify_matches_for_all_five_endpoints(
    client: TestClient, db_session, dual_write_enabled, shadow_verify_enabled
):
    _seed_owner_role(db_session)
    headers = _register_and_login(client, f"match-{uuid.uuid4().hex[:8]}@example.com")

    c = client.post("/api/v1/clients", json={"name": "C1", "phone": "+919000000002"}, headers=headers)
    assert c.status_code == 201
    client_id = c.json()["id"]
    p = client.post("/api/v1/projects", json={"client_id": client_id, "name": "P1"}, headers=headers)
    assert p.status_code == 201
    project_id = p.json()["id"]
    m = client.post(
        "/api/v1/milestones", json={"project_id": project_id, "title": "M1"}, headers=headers
    )
    assert m.status_code == 201
    k = client.post("/api/v1/api-keys/", json={"label": "K1", "scopes": []}, headers=headers)
    assert k.status_code == 201
    ai = client.post(
        "/api/v1/ai-keys/", json={"provider": "gemini", "api_key": "fake-key-1234567890"},
        headers=headers,
    )
    assert ai.status_code == 201

    for path in ("/api/v1/clients", "/api/v1/projects", "/api/v1/milestones",
                 "/api/v1/api-keys/", "/api/v1/ai-keys/"):
        resp = client.get(path, headers=headers)
        assert resp.status_code == 200, f"{path} -> {resp.status_code}: {resp.text}"

    snap = tenant_metrics.metrics.snapshot()
    assert snap["shadow_read_count"] == 5, snap
    assert snap["shadow_read_mismatch_count"] == 0, snap


def test_shadow_verify_matches_with_pagination_not_slice_size(
    client: TestClient, db_session, dual_write_enabled, shadow_verify_enabled
):
    """Regression guard for the exact bug this wiring could have introduced:
    comparing a paginated slice's length instead of the true total would
    falsely report a mismatch for any user with more rows than `limit`."""
    _seed_owner_role(db_session)
    headers = _register_and_login(client, f"paginate-{uuid.uuid4().hex[:8]}@example.com")

    for i in range(5):
        resp = client.post(
            "/api/v1/clients", json={"name": f"C{i}", "phone": f"+91900000{1000+i}"},
            headers=headers,
        )
        assert resp.status_code == 201

    resp = client.get("/api/v1/clients?limit=2", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2  # the paginated slice really is smaller than the total

    snap = tenant_metrics.metrics.snapshot()
    assert snap["shadow_read_count"] >= 1
    assert snap["shadow_read_mismatch_count"] == 0, (
        "A mismatch here would mean the comparison used the paginated slice "
        "size instead of the true pre-pagination total"
    )


def test_shadow_verify_respects_client_id_filter_on_projects(
    client: TestClient, db_session, dual_write_enabled, shadow_verify_enabled
):
    """A client_id-filtered legacy count must be compared against an
    equally client_id-filtered org-scoped count, not an org-wide total --
    otherwise every filtered list call would falsely report a mismatch."""
    _seed_owner_role(db_session)
    headers = _register_and_login(client, f"filtered-{uuid.uuid4().hex[:8]}@example.com")

    c1 = client.post("/api/v1/clients", json={"name": "C1", "phone": "+919000002001"}, headers=headers)
    c2 = client.post("/api/v1/clients", json={"name": "C2", "phone": "+919000002002"}, headers=headers)
    client.post("/api/v1/projects", json={"client_id": c1.json()["id"], "name": "P1"}, headers=headers)
    client.post("/api/v1/projects", json={"client_id": c2.json()["id"], "name": "P2"}, headers=headers)

    resp = client.get(f"/api/v1/projects?client_id={c1.json()['id']}", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    snap = tenant_metrics.metrics.snapshot()
    assert snap["shadow_read_mismatch_count"] == 0, snap


# ── A genuine mismatch is actually detected, not silently ignored ───────


def test_shadow_verify_detects_a_real_mismatch(
    client: TestClient, db_session, dual_write_enabled, shadow_verify_enabled
):
    """Proves the comparison can actually fail, not just that it always
    passes -- corrupts one client's org_id directly at the DB layer (the
    kind of drift this whole mechanism exists to catch before a real read
    cutover) and confirms it's recorded as a mismatch, not silently missed."""
    _seed_owner_role(db_session)
    headers = _register_and_login(client, f"mismatch-{uuid.uuid4().hex[:8]}@example.com")

    resp = client.post(
        "/api/v1/clients", json={"name": "C1", "phone": "+919000003001"}, headers=headers
    )
    assert resp.status_code == 201
    client_id = uuid.UUID(resp.json()["id"])

    db_client = db_session.query(Client).filter(Client.id == client_id).one()
    real_org_id = db_client.org_id

    # organizations.owner_user_id is both a real FK (to users.id) and, since
    # the P0-1 fix, uniquely constrained -- it can't point at a nonexistent
    # user, and it can't reuse this test's own user (who already owns the
    # org above). A second, bare User row (created directly, bypassing
    # registration/self-heal entirely) is a valid, org-less FK target.
    other_user = User(
        email=f"other-owner-{uuid.uuid4().hex[:8]}@example.com",
        password_hash="x", full_name="Other Owner",
    )
    db_session.add(other_user)
    db_session.commit()

    other_org = Organization(
        name="Someone Else", slug=f"someone-else-{uuid.uuid4().hex[:8]}",
        owner_user_id=other_user.id,
    )
    db_session.add(other_org)
    db_session.commit()

    db_client.org_id = other_org.id
    db_session.commit()
    assert db_client.org_id != real_org_id

    resp = client.get("/api/v1/clients", headers=headers)
    assert resp.status_code == 200  # shadow_verify_read must never affect the response

    snap = tenant_metrics.metrics.snapshot()
    assert snap["shadow_read_count"] == 1
    assert snap["shadow_read_mismatch_count"] == 1, (
        "A corrupted org_id should have been caught as a shadow-read mismatch"
    )
