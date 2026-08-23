"""
Phase 1 Milestone 3: TenantContext — a resolved (org_id, user_id, role_id,
permissions) value object threaded through write paths during the dual-write
migration. See docs/TARGET_ARCHITECTURE.md and CLAUDE.md Phase 1 log.

Enforcement (scoped sessions / RLS) is Phase 2's job. This module is the
resolution layer only: it produces the value, callers decide what to do with
it, and every write path must keep working whether org_id resolves or not.

resolve_tenant_context() is a plain callable (not a FastAPI dependency) so
it's usable from request handlers, Celery tasks, webhook handlers, and other
background jobs alike — see the module docstring precedent in
app/scripts/backfill_organizations.py, which this reuses the same
idempotent get-or-create logic from. get_tenant_context() is the thin
FastAPI DI wrapper for router use.

Gated entirely behind settings.DUAL_WRITE_ORGANIZATIONS_ENABLED (default
False): with the flag off, resolve_tenant_context() performs zero DB
queries and returns an unresolved context — a true no-op, not merely a
"resolved to nothing" result.
"""
import logging
import re
import time
import unicodedata
from dataclasses import dataclass, field
from typing import Callable, List, Optional
from uuid import UUID

from fastapi import Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.role import Role
from app.models.user import User
from app.utils import tenant_metrics
from app.utils.auth import get_current_user
from app.utils.api_key_auth import get_current_user_or_api_key

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TenantContext:
    """Resolved tenant identity for the acting principal. org_id/role_id are
    None whenever resolution hasn't run (flag off) or couldn't complete
    (self-heal failed) — callers must treat both as optional, never assumed
    present, per the backward-compatibility requirement this migration is
    built around."""

    user_id: UUID
    org_id: Optional[UUID] = None
    role_id: Optional[UUID] = None
    permissions: List[str] = field(default_factory=list)
    resolved: bool = False


def _unresolved(user_id: UUID) -> TenantContext:
    return TenantContext(user_id=user_id, org_id=None, role_id=None, permissions=[], resolved=False)


def _org_name_for(user: User) -> str:
    return user.agency_name or user.full_name or user.email.split("@")[0]


def _slug_for(user: User, name: str) -> str:
    # Deterministic and collision-resistant by construction (suffix derives
    # from the user's own id), matching app/scripts/backfill_organizations.py.
    value = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower() or "org"
    suffix = str(user.id).replace("-", "")[:8]
    return f"{value[:90]}-{suffix}"


def _resolve_owner_role(db: Session) -> Optional[Role]:
    return db.query(Role).filter(Role.org_id.is_(None), Role.name == "owner").first()


def get_or_create_personal_org(db: Session, user: User) -> Organization:
    """Idempotent get-or-create: safe under sequential retry (a failed/retried
    request re-checks and finds the org already there). NOT yet safe under
    true simultaneous concurrent requests for the same user — there's no
    unique constraint on organizations.owner_user_id today, so two racing
    calls could each insert a row. Recommended fix (not yet applied — see
    the Milestone 3 design note): add that constraint, then extend this to
    recover from the resulting IntegrityError. Deliberately not attempted
    with SAVEPOINT/nested transactions here: that requires pysqlite event-
    listener configuration this codebase's engines don't set up, and doing
    it without that configuration is known to hang rather than error.
    """
    org = db.query(Organization).filter(Organization.owner_user_id == user.id).first()
    if org is not None:
        return org

    name = _org_name_for(user)
    org = Organization(
        name=name,
        slug=_slug_for(user, name),
        owner_user_id=user.id,
        billing_region=user.billing_region or "INTL",
    )
    db.add(org)
    db.flush()
    return org


def ensure_owner_membership(db: Session, org: Organization, user: User) -> Membership:
    """Idempotent get-or-create, same sequential-retry-safe (not yet
    concurrency-safe) posture as get_or_create_personal_org — see its
    docstring. memberships does have a real unique(org_id, user_id)
    constraint (Milestone 1), so a genuine concurrent race here raises
    IntegrityError; resolve_tenant_context's caller-level rollback handles
    that without corrupting earlier work, at the cost of failing that one
    request (acceptable: this path is only reachable under an actual race,
    which is rare at current traffic levels)."""
    membership = db.query(Membership).filter(
        Membership.org_id == org.id, Membership.user_id == user.id
    ).first()
    if membership is not None:
        return membership

    owner_role = _resolve_owner_role(db)
    if owner_role is None:
        raise RuntimeError(
            "System role 'owner' not found. Has the Milestone 1 migration "
            "(c1f7825d5a5d) been applied? It seeds the 5 system roles."
        )

    membership = Membership(org_id=org.id, user_id=user.id, role_id=owner_role.id, status="active")
    db.add(membership)
    db.flush()
    return membership


def resolve_tenant_context(db: Session, user: User) -> TenantContext:
    """Plain, non-DI callable — usable from routes, Celery tasks, webhook
    handlers, and other background jobs alike.

    Never raises to the caller: any unexpected error during resolution or
    self-heal is caught, logged, and degrades to an unresolved TenantContext.
    In the common case (self-heal succeeds, or the org already exists) this
    never touches the transaction in a way that affects the caller's other
    work. In the rare case of a genuine failure requiring rollback (e.g. the
    memberships race described in ensure_owner_membership's docstring, or an
    actual DB error), the rollback is a plain Session.rollback() — it clears
    the session back to a usable state for the caller's subsequent commit,
    but it also undoes anything the caller flushed earlier in the same
    transaction (e.g. a just-flushed User row during registration). That's a
    narrow, accepted trade-off: it only fires on a genuine, rare failure, and
    the alternative (SAVEPOINT-scoped rollback) is unsafe against this
    codebase's SQLite test engine without additional pysqlite configuration
    this change doesn't introduce.
    """
    if not settings.DUAL_WRITE_ORGANIZATIONS_ENABLED:
        return _unresolved(user.id)

    start = time.monotonic()
    try:
        org = db.query(Organization).filter(Organization.owner_user_id == user.id).first()
        if org is None:
            org = get_or_create_personal_org(db, user)
            tenant_metrics.record_self_heal()
            logger.info("Tenant self-heal: created organization %s for user %s", org.id, user.id)

        membership = ensure_owner_membership(db, org, user)
        role = db.query(Role).filter(Role.id == membership.role_id).first()
        permissions = list(role.permissions) if role and role.permissions else []

        return TenantContext(
            user_id=user.id,
            org_id=org.id,
            role_id=membership.role_id,
            permissions=permissions,
            resolved=True,
        )
    except Exception:
        logger.warning(
            "Tenant resolution failed for user %s; degrading to unresolved context",
            user.id, exc_info=True,
        )
        db.rollback()
        tenant_metrics.record_resolution_failure()
        return _unresolved(user.id)
    finally:
        tenant_metrics.record_resolution_time(time.monotonic() - start)


async def get_tenant_context(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantContext:
    """FastAPI dependency wrapper around resolve_tenant_context(). Request-scoped
    via FastAPI's standard dependency caching — resolves once per request even
    if declared by multiple things in the handler chain."""
    return resolve_tenant_context(db, current_user)


async def get_tenant_context_dual(
    current_user: User = Depends(get_current_user_or_api_key),
    db: Session = Depends(get_db),
) -> TenantContext:
    """Same as get_tenant_context(), but resolves the principal via either an
    X-API-Key header or a JWT Bearer token (see api_key_auth.py). Routes meant
    for programmatic access must depend on this — and on
    get_current_user_or_api_key for `current_user` — instead of the JWT-only
    variants, or a request authenticated with a valid API key still 401s here
    (BUG-05 / F-37 in PRODUCTION_ACCEPTANCE_REPORT.md)."""
    return resolve_tenant_context(db, current_user)


def shadow_verify_read(
    db: Session,
    tenant: TenantContext,
    table_name: str,
    org_scoped_count_fn: Callable[[Session, UUID], int],
    legacy_result_count: int,
) -> None:
    """Compare a legacy user_id-scoped read result's count against what an
    org_id-scoped query would return, recording any mismatch as a metric.

    Never raises, never affects the caller's actual response — this exists
    purely to build confidence in org_id-scoped reads before Phase 2 ever
    cuts real traffic over to them. Gated behind its own flag, independent
    of DUAL_WRITE_ORGANIZATIONS_ENABLED. Not wired into any read endpoint in
    this milestone (read paths are unchanged) — it's a ready-to-call utility
    for whenever that wiring happens.
    """
    if not settings.DUAL_READ_SHADOW_VERIFY_ENABLED:
        return
    if not tenant.resolved or tenant.org_id is None:
        return
    try:
        shadow_count = org_scoped_count_fn(db, tenant.org_id)
        mismatch = shadow_count != legacy_result_count
        tenant_metrics.record_shadow_read(mismatch)
        if mismatch:
            logger.warning(
                "Shadow read mismatch for %s: legacy=%d org_scoped=%d org_id=%s user_id=%s",
                table_name, legacy_result_count, shadow_count, tenant.org_id, tenant.user_id,
            )
    except Exception:
        logger.warning("Shadow read verification failed for %s", table_name, exc_info=True)
