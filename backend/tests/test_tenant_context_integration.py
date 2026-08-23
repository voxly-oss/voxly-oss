"""Integration tests for Phase 1 Milestone 3 dual-write wiring: registration,
clients, projects, api keys (create + rotate), ai keys, billing subscriptions
(webhook path), and usage log flush (background-job path) — exercised
through the real FastAPI app / real service functions, not just the plain
resolve_tenant_context() callable (see test_tenant_context.py for that).
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.models.organization import Organization
from app.models.membership import Membership
from app.models.client import Client
from app.models.project import Project
from app.models.api_key import APIKey
from app.models.user_ai_key import UserAIKey
from app.models.subscription import Subscription
from app.models.usage_log import UsageLog
from app.models.plan import Plan
from app.models.role import Role
from app.models.user import User
from app.utils import tenant_metrics


# ── Fixtures ─────────────────────────────────────────────────────────


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


def _seed_owner_role(db_session) -> Role:
    role = Role(name="owner", org_id=None, permissions=["org:admin"], is_system=True)
    db_session.add(role)
    db_session.commit()
    db_session.refresh(role)
    return role


def _register_and_login(client: TestClient, email: str, password: str = "Test1234") -> dict:
    client.post("/api/v1/auth/register", json={
        "email": email, "password": password, "full_name": "Test User", "agency_name": "Acme",
    })
    resp = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Flag OFF (default): true no-op end to end ────────────────────────


def test_flag_off_full_flow_creates_no_org_or_membership(client: TestClient, db_session):
    """The default-off guarantee, proven across every wired write path in
    one flow: register, create client, create project, create api key,
    add ai key -- and confirm zero organizations/memberships exist after."""
    assert settings.DUAL_WRITE_ORGANIZATIONS_ENABLED is False
    _seed_owner_role(db_session)  # present but must be irrelevant while the flag is off

    email = f"flagoff-{uuid.uuid4().hex[:8]}@example.com"
    headers = _register_and_login(client, email)

    c = client.post("/api/v1/clients", json={"name": "C1", "phone": "+919999911111"}, headers=headers)
    assert c.status_code == 201

    p = client.post("/api/v1/projects", json={"client_id": c.json()["id"], "name": "P1"}, headers=headers)
    assert p.status_code == 201

    k = client.post("/api/v1/api-keys/", json={"label": "K1", "scopes": []}, headers=headers)
    assert k.status_code == 201

    rotated = client.post(f"/api/v1/api-keys/{k.json()['id']}/rotate", headers=headers)
    assert rotated.status_code == 200

    ai = client.post(
        "/api/v1/ai-keys/",
        json={"provider": "gemini", "api_key": "fake-key-1234567890"},
        headers=headers,
    )
    assert ai.status_code == 201

    assert db_session.query(Organization).count() == 0
    assert db_session.query(Membership).count() == 0
    assert tenant_metrics.metrics.snapshot()["resolution_count"] == 0


# ── Flag ON: registration creates org+membership atomically ─────────


def test_flag_on_registration_creates_org_and_owner_membership(client: TestClient, db_session, dual_write_enabled):
    _seed_owner_role(db_session)

    email = f"flagon-{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/api/v1/auth/register", json={
        "email": email, "password": "Test1234", "full_name": "Test", "agency_name": "Acme",
    })
    assert reg.status_code == 201
    user_id = uuid.UUID(reg.json()["id"])

    org = db_session.query(Organization).filter(Organization.owner_user_id == user_id).one()
    membership = db_session.query(Membership).filter(
        Membership.org_id == org.id, Membership.user_id == user_id
    ).one()
    assert membership.status == "active"
    assert membership.role.name == "owner"


def test_flag_on_registration_failure_rolls_back_atomically(client: TestClient, db_session, dual_write_enabled):
    """Duplicate-email registration must fail before ever reaching tenant
    resolution -- no org is created for a registration that doesn't succeed."""
    _seed_owner_role(db_session)
    email = f"dup-{uuid.uuid4().hex[:8]}@example.com"
    _register_and_login(client, email)  # first registration succeeds

    dup = client.post("/api/v1/auth/register", json={
        "email": email, "password": "Test1234", "full_name": "Test", "agency_name": "Acme",
    })
    assert dup.status_code == 400

    # Exactly one org (from the first, successful registration) -- the
    # rejected duplicate attempt created nothing.
    assert db_session.query(Organization).count() == 1


# ── Flag ON: every wired write path stamps org_id ────────────────────


def test_flag_on_write_paths_stamp_org_id(client: TestClient, db_session, dual_write_enabled):
    _seed_owner_role(db_session)

    email = f"stamp-{uuid.uuid4().hex[:8]}@example.com"
    headers = _register_and_login(client, email)
    me = client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me.json()["id"])
    org = db_session.query(Organization).filter(Organization.owner_user_id == user_id).one()

    c = client.post("/api/v1/clients", json={"name": "C1", "phone": "+919999922222"}, headers=headers)
    assert c.status_code == 201
    client_row = db_session.query(Client).filter(Client.id == uuid.UUID(c.json()["id"])).one()
    assert client_row.org_id == org.id

    p = client.post("/api/v1/projects", json={"client_id": c.json()["id"], "name": "P1"}, headers=headers)
    assert p.status_code == 201
    project_row = db_session.query(Project).filter(Project.id == uuid.UUID(p.json()["id"])).one()
    assert project_row.org_id == org.id

    k = client.post("/api/v1/api-keys/", json={"label": "K1", "scopes": []}, headers=headers)
    assert k.status_code == 201
    key_row = db_session.query(APIKey).filter(APIKey.id == uuid.UUID(k.json()["id"])).one()
    assert key_row.org_id == org.id

    rotated = client.post(f"/api/v1/api-keys/{k.json()['id']}/rotate", headers=headers)
    assert rotated.status_code == 200
    new_key_row = db_session.query(APIKey).filter(APIKey.id == uuid.UUID(rotated.json()["id"])).one()
    assert new_key_row.org_id == org.id

    ai = client.post(
        "/api/v1/ai-keys/",
        json={"provider": "gemini", "api_key": "fake-key-1234567890"},
        headers=headers,
    )
    assert ai.status_code == 201
    ai_row = db_session.query(UserAIKey).filter(UserAIKey.id == uuid.UUID(ai.json()["id"])).one()
    assert ai_row.org_id == org.id


def test_flag_on_self_heals_for_pre_existing_user(client: TestClient, db_session, dual_write_enabled):
    """A user created before Milestone 3 (no org yet, e.g. pre-backfill) gets
    self-healed on their first write action, not just at registration time."""
    _seed_owner_role(db_session)

    from app.utils.auth import get_password_hash
    user = User(
        email=f"legacy-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=get_password_hash("Test1234"),
        full_name="Legacy User",
        agency_name="Legacy Agency",
    )
    db_session.add(user)
    db_session.commit()
    assert db_session.query(Organization).filter(Organization.owner_user_id == user.id).count() == 0

    login = client.post("/api/v1/auth/login", data={"username": user.email, "password": "Test1234"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    c = client.post("/api/v1/clients", json={"name": "Legacy Client", "phone": "+919999933333"}, headers=headers)
    assert c.status_code == 201

    org = db_session.query(Organization).filter(Organization.owner_user_id == user.id).one()
    client_row = db_session.query(Client).filter(Client.id == uuid.UUID(c.json()["id"])).one()
    assert client_row.org_id == org.id
    assert tenant_metrics.metrics.snapshot()["self_heal_count"] == 1


# ── Billing webhook path (no current_user; plain resolve_tenant_context) ──


def test_stripe_checkout_completed_stamps_org_id(db_session, dual_write_enabled):
    from app.api.v1.billing import _handle_stripe_checkout_completed

    _seed_owner_role(db_session)
    plan = Plan(name=f"Pro-{uuid.uuid4().hex[:6]}", slug=f"pro-{uuid.uuid4().hex[:6]}")
    db_session.add(plan)
    user = User(email=f"webhook-{uuid.uuid4().hex[:8]}@example.com", password_hash="x", full_name="W")
    db_session.add(user)
    db_session.commit()

    session = {
        "metadata": {"user_id": str(user.id), "plan_id": str(plan.id)},
        "subscription": "sub_123",
        "customer": "cus_123",
    }
    _handle_stripe_checkout_completed(db_session, session)

    org = db_session.query(Organization).filter(Organization.owner_user_id == user.id).one()
    sub = db_session.query(Subscription).filter(Subscription.user_id == user.id).one()
    assert sub.org_id == org.id
    assert sub.status == "active"


def test_stripe_checkout_completed_flag_off_leaves_org_id_none(db_session):
    from app.api.v1.billing import _handle_stripe_checkout_completed
    assert settings.DUAL_WRITE_ORGANIZATIONS_ENABLED is False

    plan = Plan(name=f"Pro2-{uuid.uuid4().hex[:6]}", slug=f"pro2-{uuid.uuid4().hex[:6]}")
    db_session.add(plan)
    user = User(email=f"webhook2-{uuid.uuid4().hex[:8]}@example.com", password_hash="x", full_name="W2")
    db_session.add(user)
    db_session.commit()

    session = {
        "metadata": {"user_id": str(user.id), "plan_id": str(plan.id)},
        "subscription": "sub_456",
        "customer": "cus_456",
    }
    _handle_stripe_checkout_completed(db_session, session)

    sub = db_session.query(Subscription).filter(Subscription.user_id == user.id).one()
    assert sub.org_id is None
    assert db_session.query(Organization).count() == 0


def test_razorpay_payment_captured_stamps_org_id(db_session, dual_write_enabled):
    from app.api.v1.billing import _handle_razorpay_payment_captured

    _seed_owner_role(db_session)
    plan = Plan(name=f"RP-{uuid.uuid4().hex[:6]}", slug=f"rp-{uuid.uuid4().hex[:6]}")
    db_session.add(plan)
    user = User(email=f"rzpwebhook-{uuid.uuid4().hex[:8]}@example.com", password_hash="x", full_name="RW")
    db_session.add(user)
    db_session.commit()

    payment = {
        "id": "pay_123",
        "notes": {"user_id": str(user.id), "plan_id": str(plan.id)},
    }
    _handle_razorpay_payment_captured(db_session, payment)

    org = db_session.query(Organization).filter(Organization.owner_user_id == user.id).one()
    sub = db_session.query(Subscription).filter(Subscription.user_id == user.id).one()
    assert sub.org_id == org.id


# ── Usage log flush (background-job path) ────────────────────────────


class _FakeRedis:
    """Minimal stand-in for the redis client's .get() used by get_usage_today."""

    def __init__(self, count: int):
        self._count = count

    def get(self, key):
        return str(self._count)


@pytest.mark.asyncio
async def test_usage_log_flush_stamps_org_id(db_session, dual_write_enabled):
    from app.utils.usage_tracker import UsageTracker

    _seed_owner_role(db_session)
    user = User(email=f"usage-{uuid.uuid4().hex[:8]}@example.com", password_hash="x", full_name="U")
    db_session.add(user)
    db_session.commit()

    tracker = UsageTracker(_FakeRedis(count=5))
    await tracker.flush_to_db(db_session, str(user.id))

    org = db_session.query(Organization).filter(Organization.owner_user_id == user.id).one()
    log = db_session.query(UsageLog).filter(UsageLog.user_id == user.id).one()
    assert log.org_id == org.id
    assert log.request_count == 5


@pytest.mark.asyncio
async def test_usage_log_flush_flag_off_leaves_org_id_none(db_session):
    from app.utils.usage_tracker import UsageTracker
    assert settings.DUAL_WRITE_ORGANIZATIONS_ENABLED is False

    user = User(email=f"usage2-{uuid.uuid4().hex[:8]}@example.com", password_hash="x", full_name="U2")
    db_session.add(user)
    db_session.commit()

    tracker = UsageTracker(_FakeRedis(count=3))
    await tracker.flush_to_db(db_session, str(user.id))

    log = db_session.query(UsageLog).filter(UsageLog.user_id == user.id).one()
    assert log.org_id is None
    assert db_session.query(Organization).count() == 0
