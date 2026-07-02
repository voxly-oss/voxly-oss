"""
Plan entitlement enforcement.

Central place that answers: "is this tenant allowed to do X on their current plan?"
Used at resource-creation time so the freemium/paid tiers actually mean something.

Design notes:
- The single source of truth for entitlements is the active Subscription -> Plan.
  We fall back to the seeded "free" plan when a user has no active subscription.
- AI-message quota is checked against the Redis usage counter (monthly), so it
  degrades gracefully to "allowed" if Redis is unavailable (never block a paying
  customer's client on an infra blip).
- Raises HTTP 402 (Payment Required) so the frontend can distinguish "upgrade needed"
  from generic 400/403 and show an upgrade modal.
"""
import logging
from functools import lru_cache
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.client import Client
from app.models.project import Project
from app.models.plan import Plan
from app.models.subscription import Subscription

logger = logging.getLogger(__name__)

# Sensible defaults if the "free" plan row is missing (e.g. seed not run).
_FALLBACK_FREE = {
    "max_clients": 5,
    "max_projects": 3,
    "max_api_keys": 1,
    "max_ai_messages_per_month": 50,
}


class PlanLimitError(HTTPException):
    """402 raised when a tenant hits a plan limit. Carries structured detail
    so the frontend can render a targeted upgrade prompt."""

    def __init__(self, resource: str, limit: int, plan_name: str):
        super().__init__(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error": "plan_limit_reached",
                "resource": resource,
                "limit": limit,
                "plan": plan_name,
                "message": (
                    f"You've reached your {plan_name} plan limit of "
                    f"{limit} {resource}. Upgrade to add more."
                ),
            },
        )


def get_active_plan(db: Session, user: User) -> Plan:
    """Resolve the tenant's effective plan (active/trialing subscription, else free)."""
    subscription = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user.id,
            Subscription.status.in_(["active", "trialing"]),
        )
        .first()
    )
    if subscription and subscription.plan:
        return subscription.plan

    free_plan = db.query(Plan).filter(Plan.slug == "free").first()
    if free_plan:
        return free_plan
    # Last-resort synthetic plan so limits still apply without a seeded DB.
    return Plan(name="Free", slug="free", **_FALLBACK_FREE)


def enforce_client_limit(db: Session, user: User) -> None:
    """Block creating a client beyond the plan's max_clients."""
    plan = get_active_plan(db, user)
    count = (
        db.query(Client)
        .filter(Client.user_id == user.id, Client.deleted_at.is_(None))
        .count()
    )
    if count >= plan.max_clients:
        raise PlanLimitError("clients", plan.max_clients, plan.name)


def enforce_project_limit(db: Session, user: User) -> None:
    """Block creating a project beyond the plan's max_projects (counted per tenant)."""
    plan = get_active_plan(db, user)
    count = (
        db.query(Project)
        .join(Client, Client.id == Project.client_id)
        .filter(Client.user_id == user.id, Project.deleted_at.is_(None))
        .count()
    )
    if count >= plan.max_projects:
        raise PlanLimitError("projects", plan.max_projects, plan.name)


def enforce_api_key_limit(db: Session, user: User) -> None:
    """Block creating an API key beyond the plan's max_api_keys."""
    from app.models.api_key import APIKey

    plan = get_active_plan(db, user)
    count = (
        db.query(APIKey)
        .filter(
            APIKey.user_id == user.id,
            APIKey.is_active == True,  # noqa: E712 (SQLAlchemy needs ==)
            APIKey.revoked_at.is_(None),
        )
        .count()
    )
    if count >= plan.max_api_keys:
        raise PlanLimitError("API keys", plan.max_api_keys, plan.name)


async def check_ai_message_quota(db: Session, user: User) -> bool:
    """
    Return True if the tenant may consume another AI message this month.

    Non-blocking by design: if Redis is unavailable we allow the message
    rather than break a customer's live client conversation.
    """
    plan = get_active_plan(db, user)
    try:
        from app.utils.usage_tracker import get_usage_tracker

        used = await get_usage_tracker().get_ai_messages_month(str(user.id))
    except Exception as exc:  # pragma: no cover - infra failure path
        logger.warning("AI quota check failed open (Redis?): %s", exc)
        return True
    return used < plan.max_ai_messages_per_month
