"""Tests for the Phase 1 Milestone 2 backfill script
(app/scripts/backfill_organizations.py).

Every test injects the test-bound `db_session` fixture directly into
run_backfill/run_verify/run_rollback (via their `db=` parameter) so nothing
here ever touches the production database that SessionLocal is bound to.
"""
import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.models.user import User
from app.models.client import Client
from app.models.project import Project
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.api_key import APIKey
from app.models.usage_log import UsageLog
from app.models.user_ai_key import UserAIKey
from app.models.role import Role
from app.models.organization import Organization
from app.models.membership import Membership

from app.scripts.backfill_organizations import (
    run_backfill,
    run_verify,
    run_rollback,
    compute_preflight_summary,
)


# ── Fixtures / helpers ───────────────────────────────────────────────


def _seed_owner_role(db_session) -> Role:
    """Mirrors the system role seeded by the Milestone 1 Alembic migration."""
    role = Role(name="owner", org_id=None, permissions=["org:admin"], is_system=True)
    db_session.add(role)
    db_session.commit()
    db_session.refresh(role)
    return role


def _make_user(db_session, email=None, agency_name="Acme Agency") -> User:
    email = email or f"user-{uuid.uuid4().hex[:8]}@example.com"
    user = User(email=email, password_hash="hashed", full_name="Test User", agency_name=agency_name)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _make_client(db_session, user: User, phone=None, deleted=False) -> Client:
    phone = phone or f"+91{uuid.uuid4().int % 10**10:010d}"
    c = Client(user_id=user.id, name="Some Client", phone=phone,
               deleted_at=datetime.utcnow() if deleted else None)
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


def _make_project(db_session, client: Client) -> Project:
    p = Project(client_id=client.id, name="Some Project")
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def _make_plan(db_session, slug=None) -> Plan:
    slug = slug or f"plan-{uuid.uuid4().hex[:8]}"
    plan = Plan(name=slug, slug=slug)
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    return plan


def _make_subscription(db_session, user: User, plan: Plan) -> Subscription:
    sub = Subscription(user_id=user.id, plan_id=plan.id)
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    return sub


def _make_api_key(db_session, user: User) -> APIKey:
    key = APIKey(user_id=user.id, key_hash="hash", key_prefix="vx_live_abcd", label="Test Key")
    db_session.add(key)
    db_session.commit()
    db_session.refresh(key)
    return key


def _make_usage_log(db_session, user: User) -> UsageLog:
    log = UsageLog(user_id=user.id, endpoint="/api/v1/clients", method="GET")
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)
    return log


def _make_ai_key(db_session, user: User) -> UserAIKey:
    key = UserAIKey(user_id=user.id, provider="openai", api_key_encrypted="cipher")
    db_session.add(key)
    db_session.commit()
    db_session.refresh(key)
    return key


def _full_fixture_user(db_session, plan: Plan, email=None):
    """A user with one of every resource type."""
    user = _make_user(db_session, email=email)
    c = _make_client(db_session, user)
    p = _make_project(db_session, c)
    sub = _make_subscription(db_session, user, plan)
    key = _make_api_key(db_session, user)
    log = _make_usage_log(db_session, user)
    ai_key = _make_ai_key(db_session, user)
    return user, c, p, sub, key, log, ai_key


# ── Core backfill behavior ───────────────────────────────────────────


def test_backfill_creates_org_and_owner_membership_per_user(db_session):
    _seed_owner_role(db_session)
    plan = _make_plan(db_session)
    user1, c1, p1, sub1, key1, log1, ai1 = _full_fixture_user(db_session, plan)
    user2, c2, p2, sub2, key2, log2, ai2 = _full_fixture_user(db_session, plan)

    run_backfill(auto_confirm=True, db=db_session)

    assert db_session.query(Organization).count() == 2
    assert db_session.query(Membership).count() == 2

    for user, c, p, sub, key, log, ai in [
        (user1, c1, p1, sub1, key1, log1, ai1),
        (user2, c2, p2, sub2, key2, log2, ai2),
    ]:
        org = db_session.query(Organization).filter(Organization.owner_user_id == user.id).one()
        membership = db_session.query(Membership).filter(
            Membership.org_id == org.id, Membership.user_id == user.id
        ).one()
        assert membership.status == "active"
        assert membership.role.name == "owner"

        db_session.refresh(c)
        db_session.refresh(p)
        db_session.refresh(sub)
        db_session.refresh(key)
        db_session.refresh(log)
        db_session.refresh(ai)
        assert c.org_id == org.id
        assert p.org_id == org.id  # derived via client, not a direct user_id
        assert sub.org_id == org.id
        assert key.org_id == org.id
        assert log.org_id == org.id
        assert ai.org_id == org.id


def test_backfill_handles_user_with_no_resources(db_session):
    _seed_owner_role(db_session)
    user = _make_user(db_session)

    run_backfill(auto_confirm=True, db=db_session)

    org = db_session.query(Organization).filter(Organization.owner_user_id == user.id).one()
    membership = db_session.query(Membership).filter(
        Membership.org_id == org.id, Membership.user_id == user.id
    ).one()
    assert membership.role.name == "owner"


def test_backfill_respects_soft_deleted_rows(db_session):
    _seed_owner_role(db_session)
    user = _make_user(db_session)
    deleted_client = _make_client(db_session, user, deleted=True)

    run_backfill(auto_confirm=True, db=db_session)

    db_session.refresh(deleted_client)
    org = db_session.query(Organization).filter(Organization.owner_user_id == user.id).one()
    assert deleted_client.org_id == org.id


# ── Idempotency / restart-safety ─────────────────────────────────────


def test_backfill_is_idempotent(db_session):
    _seed_owner_role(db_session)
    plan = _make_plan(db_session)
    _full_fixture_user(db_session, plan)
    _full_fixture_user(db_session, plan)

    run_backfill(auto_confirm=True, db=db_session)
    orgs_after_first = db_session.query(Organization).count()
    memberships_after_first = db_session.query(Membership).count()

    run_backfill(auto_confirm=True, db=db_session)
    orgs_after_second = db_session.query(Organization).count()
    memberships_after_second = db_session.query(Membership).count()

    assert orgs_after_second == orgs_after_first == 2
    assert memberships_after_second == memberships_after_first == 2


def test_backfill_resumes_from_partial_state(db_session):
    """Simulates a crash after org+membership were created for a user but
    before their resources were stamped -- rerunning must not create a
    duplicate org, and must finish stamping the remaining rows."""
    owner_role = _seed_owner_role(db_session)
    user = _make_user(db_session)
    client_row = _make_client(db_session, user)

    # Pre-create the org + membership by hand, as if a prior run got this far.
    org = Organization(name="Pre-existing Org", slug="pre-existing-org", owner_user_id=user.id)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    db_session.add(Membership(org_id=org.id, user_id=user.id, role_id=owner_role.id, status="active"))
    db_session.commit()
    # client_row.org_id is deliberately left NULL to simulate the crash point.

    run_backfill(auto_confirm=True, db=db_session)

    assert db_session.query(Organization).filter(Organization.owner_user_id == user.id).count() == 1
    assert db_session.query(Membership).filter(Membership.user_id == user.id).count() == 1
    db_session.refresh(client_row)
    assert client_row.org_id == org.id


def test_backfill_chunking_with_small_chunk_size(db_session):
    """A user with several clients (each with a project): a tiny chunk_size
    forces multiple chunk iterations per table, proving the chunk loop
    doesn't miss or double-process rows at the boundary."""
    _seed_owner_role(db_session)
    user = _make_user(db_session)
    clients = [_make_client(db_session, user) for _ in range(5)]
    projects = [_make_project(db_session, c) for c in clients]

    run_backfill(auto_confirm=True, chunk_size=2, db=db_session)

    org = db_session.query(Organization).filter(Organization.owner_user_id == user.id).one()
    for c in clients:
        db_session.refresh(c)
        assert c.org_id == org.id
    for p in projects:
        db_session.refresh(p)
        assert p.org_id == org.id


def test_backfill_dry_run_makes_no_writes(db_session):
    _seed_owner_role(db_session)
    user = _make_user(db_session)
    c = _make_client(db_session, user)

    run_backfill(dry_run=True, db=db_session)

    assert db_session.query(Organization).count() == 0
    assert db_session.query(Membership).count() == 0
    db_session.refresh(c)
    assert c.org_id is None


# ── Pre-flight summary ───────────────────────────────────────────────


def test_preflight_summary_counts(db_session):
    _seed_owner_role(db_session)
    plan = _make_plan(db_session)
    _full_fixture_user(db_session, plan)   # one user with one of every resource
    _make_user(db_session)                  # one user with nothing

    summary = compute_preflight_summary(db_session)

    assert summary.users_to_process == 2
    assert summary.orgs_to_create == 2
    assert summary.memberships_to_create == 2
    assert summary.rows_to_update["clients"] == 1
    assert summary.rows_to_update["projects"] == 1
    assert summary.rows_to_update["subscriptions"] == 1
    assert summary.rows_to_update["api_keys"] == 1
    assert summary.rows_to_update["usage_logs"] == 1
    assert summary.rows_to_update["user_ai_keys"] == 1
    assert summary.estimated_seconds > 0
    assert not summary.is_noop()


def test_preflight_summary_noop_after_backfill(db_session):
    _seed_owner_role(db_session)
    plan = _make_plan(db_session)
    _full_fixture_user(db_session, plan)

    run_backfill(auto_confirm=True, db=db_session)
    summary = compute_preflight_summary(db_session)

    assert summary.is_noop()


# ── Verification ─────────────────────────────────────────────────────


def test_verify_passes_after_backfill(db_session):
    _seed_owner_role(db_session)
    plan = _make_plan(db_session)
    _full_fixture_user(db_session, plan)

    run_backfill(auto_confirm=True, db=db_session)

    assert run_verify(db=db_session) is True


def test_verify_fails_when_row_missing_org_id(db_session):
    _seed_owner_role(db_session)
    plan = _make_plan(db_session)
    user, c, p, sub, key, log, ai = _full_fixture_user(db_session, plan)

    run_backfill(auto_confirm=True, db=db_session)

    c.org_id = None
    db_session.add(c)
    db_session.commit()

    assert run_verify(db=db_session) is False


# ── Rollback ─────────────────────────────────────────────────────────


def test_rollback_reverses_backfill(db_session):
    _seed_owner_role(db_session)
    plan = _make_plan(db_session)
    user, c, p, sub, key, log, ai = _full_fixture_user(db_session, plan)

    run_backfill(auto_confirm=True, db=db_session)
    assert db_session.query(Organization).count() == 1

    run_rollback(auto_confirm=True, db=db_session)

    assert db_session.query(Organization).count() == 0
    assert db_session.query(Membership).count() == 0
    for row in (c, p, sub, key, log, ai):
        db_session.refresh(row)
        assert row.org_id is None


# ── Regression: existing API flows unaffected ────────────────────────


def test_register_login_and_create_client_unaffected_by_backfill(client: TestClient, db_session):
    """Running the backfill script alongside normal API traffic doesn't
    change register/login/create-client behavior -- nothing in the app
    reads org_id yet."""
    _seed_owner_role(db_session)

    email = f"regress-{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Test1234",
        "full_name": "Regression User",
        "agency_name": "Regression Agency",
    })
    assert reg.status_code in (200, 201)

    run_backfill(auto_confirm=True, db=db_session)

    login = client.post("/api/v1/auth/login", data={
        "username": email,
        "password": "Test1234",
    })
    assert login.status_code == 200
    token = login.json()["access_token"]

    resp = client.post(
        "/api/v1/clients",
        json={"name": "Regression Client", "phone": "+919999911111", "email": "rc2@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code in (200, 201)
    assert resp.json()["name"] == "Regression Client"
