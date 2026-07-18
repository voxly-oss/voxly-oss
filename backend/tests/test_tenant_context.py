"""Unit tests for Phase 1 Milestone 3: TenantContext, resolve_tenant_context(),
get_or_create_personal_org(), ensure_owner_membership(), shadow_verify_read(),
and the tenant_metrics counters.

These are unit-level: they call the plain callables directly against the
db_session fixture, not through the FastAPI app. Integration-level coverage
(routes actually wired to get_tenant_context) lives in
test_tenant_context_integration.py.
"""
import uuid

import pytest

from app.config import settings
from app.models.user import User
from app.models.role import Role
from app.models.organization import Organization
from app.models.membership import Membership
from app.utils import tenant_metrics
from app.utils.tenant_context import (
    TenantContext,
    resolve_tenant_context,
    get_or_create_personal_org,
    ensure_owner_membership,
    shadow_verify_read,
)


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


@pytest.fixture
def shadow_read_enabled():
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


def _make_user(db_session, email=None) -> User:
    email = email or f"user-{uuid.uuid4().hex[:8]}@example.com"
    user = User(email=email, password_hash="hashed", full_name="Test User", agency_name="Acme")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# ── Flag is a true no-op when off ────────────────────────────────────


def test_resolve_tenant_context_flag_off_is_noop(db_session):
    assert settings.DUAL_WRITE_ORGANIZATIONS_ENABLED is False
    user = _make_user(db_session)

    tenant = resolve_tenant_context(db_session, user)

    assert tenant.resolved is False
    assert tenant.org_id is None
    assert tenant.role_id is None
    assert tenant.permissions == []
    assert tenant.user_id == user.id
    assert db_session.query(Organization).count() == 0
    assert db_session.query(Membership).count() == 0
    # A true no-op doesn't even record a resolution attempt.
    assert tenant_metrics.metrics.snapshot()["resolution_count"] == 0


# ── Self-heal ────────────────────────────────────────────────────────


def test_resolve_tenant_context_flag_on_self_heals(db_session, dual_write_enabled):
    owner_role = _seed_owner_role(db_session)
    user = _make_user(db_session)

    tenant = resolve_tenant_context(db_session, user)

    assert tenant.resolved is True
    assert tenant.user_id == user.id
    assert tenant.org_id is not None
    assert tenant.role_id == owner_role.id
    assert tenant.permissions == owner_role.permissions

    org = db_session.query(Organization).filter(Organization.owner_user_id == user.id).one()
    assert org.id == tenant.org_id
    membership = db_session.query(Membership).filter(
        Membership.org_id == org.id, Membership.user_id == user.id
    ).one()
    assert membership.role_id == owner_role.id

    snap = tenant_metrics.metrics.snapshot()
    assert snap["self_heal_count"] == 1
    assert snap["resolution_count"] == 1
    assert snap["resolution_failure_count"] == 0


def test_resolve_tenant_context_idempotent_existing_org(db_session, dual_write_enabled):
    _seed_owner_role(db_session)
    user = _make_user(db_session)

    first = resolve_tenant_context(db_session, user)
    second = resolve_tenant_context(db_session, user)

    assert first.org_id == second.org_id
    assert db_session.query(Organization).count() == 1
    assert db_session.query(Membership).count() == 1
    # Self-heal only fires once -- the second call found the org already there.
    assert tenant_metrics.metrics.snapshot()["self_heal_count"] == 1
    assert tenant_metrics.metrics.snapshot()["resolution_count"] == 2


def test_resolve_tenant_context_reuses_pre_existing_org(db_session, dual_write_enabled):
    """A user who already has an org (e.g. from the Milestone 2 backfill)
    resolves against it rather than creating a second one."""
    owner_role = _seed_owner_role(db_session)
    user = _make_user(db_session)
    org = Organization(name="Pre-existing", slug="pre-existing-org", owner_user_id=user.id)
    db_session.add(org)
    db_session.commit()
    db_session.add(Membership(org_id=org.id, user_id=user.id, role_id=owner_role.id, status="active"))
    db_session.commit()

    tenant = resolve_tenant_context(db_session, user)

    assert tenant.org_id == org.id
    assert db_session.query(Organization).count() == 1
    assert tenant_metrics.metrics.snapshot()["self_heal_count"] == 0


# ── Graceful degradation ─────────────────────────────────────────────


def test_resolve_tenant_context_degrades_when_owner_role_missing(db_session, dual_write_enabled):
    """No system 'owner' role seeded -- simulates a broken/pre-Milestone-1
    state. resolve_tenant_context must never raise to its caller."""
    user = _make_user(db_session)

    tenant = resolve_tenant_context(db_session, user)

    assert tenant.resolved is False
    assert tenant.org_id is None
    snap = tenant_metrics.metrics.snapshot()
    assert snap["resolution_failure_count"] == 1


# ── get_or_create_personal_org / ensure_owner_membership directly ───


def test_get_or_create_personal_org_idempotent(db_session):
    user = _make_user(db_session)

    org1 = get_or_create_personal_org(db_session, user)
    db_session.commit()
    org2 = get_or_create_personal_org(db_session, user)

    assert org1.id == org2.id
    assert db_session.query(Organization).count() == 1


def test_ensure_owner_membership_idempotent(db_session):
    owner_role = _seed_owner_role(db_session)
    user = _make_user(db_session)
    org = get_or_create_personal_org(db_session, user)
    db_session.commit()

    m1 = ensure_owner_membership(db_session, org, user)
    db_session.commit()
    m2 = ensure_owner_membership(db_session, org, user)

    assert m1.id == m2.id
    assert db_session.query(Membership).count() == 1


# ── Metrics ──────────────────────────────────────────────────────────


def test_tenant_metrics_snapshot_and_reset():
    tenant_metrics.metrics.record_resolution_time(0.01)
    tenant_metrics.metrics.record_resolution_time(0.03)
    tenant_metrics.metrics.record_self_heal()
    tenant_metrics.metrics.record_resolution_failure()
    tenant_metrics.metrics.record_shadow_read(mismatch=False)
    tenant_metrics.metrics.record_shadow_read(mismatch=True)

    snap = tenant_metrics.metrics.snapshot()
    assert snap["resolution_count"] == 2
    assert snap["resolution_time_avg_seconds"] == pytest.approx(0.02)
    assert snap["resolution_time_max_seconds"] == pytest.approx(0.03)
    assert snap["self_heal_count"] == 1
    assert snap["resolution_failure_count"] == 1
    assert snap["shadow_read_count"] == 2
    assert snap["shadow_read_mismatch_count"] == 1

    tenant_metrics.metrics.reset()
    assert tenant_metrics.metrics.snapshot() == {
        "resolution_count": 0,
        "resolution_time_avg_seconds": 0.0,
        "resolution_time_max_seconds": 0.0,
        "self_heal_count": 0,
        "resolution_failure_count": 0,
        "shadow_read_count": 0,
        "shadow_read_mismatch_count": 0,
    }


# ── Shadow read verification (utility only -- not wired into any route) ──


def test_shadow_verify_read_flag_off_is_noop(db_session, dual_write_enabled):
    _seed_owner_role(db_session)
    user = _make_user(db_session)
    tenant = resolve_tenant_context(db_session, user)
    assert settings.DUAL_READ_SHADOW_VERIFY_ENABLED is False

    shadow_verify_read(db_session, tenant, "clients", lambda db, org_id: 999, legacy_result_count=1)

    assert tenant_metrics.metrics.snapshot()["shadow_read_count"] == 0


def test_shadow_verify_read_match_records_no_mismatch(db_session, dual_write_enabled, shadow_read_enabled):
    _seed_owner_role(db_session)
    user = _make_user(db_session)
    tenant = resolve_tenant_context(db_session, user)

    shadow_verify_read(db_session, tenant, "clients", lambda db, org_id: 3, legacy_result_count=3)

    snap = tenant_metrics.metrics.snapshot()
    assert snap["shadow_read_count"] == 1
    assert snap["shadow_read_mismatch_count"] == 0


def test_shadow_verify_read_mismatch_is_recorded(db_session, dual_write_enabled, shadow_read_enabled):
    _seed_owner_role(db_session)
    user = _make_user(db_session)
    tenant = resolve_tenant_context(db_session, user)

    shadow_verify_read(db_session, tenant, "clients", lambda db, org_id: 5, legacy_result_count=3)

    snap = tenant_metrics.metrics.snapshot()
    assert snap["shadow_read_count"] == 1
    assert snap["shadow_read_mismatch_count"] == 1


def test_shadow_verify_read_skipped_when_tenant_unresolved(db_session, shadow_read_enabled):
    user = _make_user(db_session)
    # DUAL_WRITE_ORGANIZATIONS_ENABLED is off here -> tenant is unresolved.
    tenant = resolve_tenant_context(db_session, user)

    shadow_verify_read(db_session, tenant, "clients", lambda db, org_id: 5, legacy_result_count=3)

    assert tenant_metrics.metrics.snapshot()["shadow_read_count"] == 0


def test_shadow_verify_read_never_raises_on_query_error(db_session, dual_write_enabled, shadow_read_enabled):
    _seed_owner_role(db_session)
    user = _make_user(db_session)
    tenant = resolve_tenant_context(db_session, user)

    def _boom(db, org_id):
        raise RuntimeError("simulated query failure")

    shadow_verify_read(db_session, tenant, "clients", _boom, legacy_result_count=3)  # must not raise

    assert tenant_metrics.metrics.snapshot()["shadow_read_count"] == 0
