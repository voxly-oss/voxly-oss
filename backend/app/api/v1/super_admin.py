"""
Super Admin API — Voxly Owner Command Center

Protected by double-authentication:
  1. Must be logged in as SUPER_ADMIN_EMAIL
  2. Must supply X-Admin-Secret header matching SUPER_ADMIN_SECRET

This router is intentionally NOT exposed in API docs (include_in_schema=False on router).
"""
import secrets
from datetime import timedelta
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.client import Client
from app.models.project import Project
from app.models.chat_history import ChatHistory
from app.models.subscription import Subscription
from app.models.plan import Plan
from app.utils.auth import get_current_user, create_access_token

import logging

logger = logging.getLogger(__name__)
router = APIRouter()
USER_NOT_FOUND = "User not found"


# ─── Auth Guard ──────────────────────────────────────────────────────────────

def require_super_admin(
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
    current_user: Annotated[User , Depends(get_current_user)],
) -> User:
    """
    Dual-factor super admin guard:
    1. Must be authenticated as SUPER_ADMIN_EMAIL
    2. Must supply matching X-Admin-Secret header
    """
    if not settings.SUPER_ADMIN_EMAIL or not settings.SUPER_ADMIN_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Super admin not configured on this instance."
        )

    if current_user.email.lower() != settings.SUPER_ADMIN_EMAIL.lower():
        logger.warning(f"Super admin access denied for {current_user.email}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if not x_admin_secret or not secrets.compare_digest(
        x_admin_secret, settings.SUPER_ADMIN_SECRET
    ):
        logger.warning(f"Super admin secret mismatch from {current_user.email}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    logger.info(f"Super admin access granted to {current_user.email}")
    return current_user


# ─── Schemas ─────────────────────────────────────────────────────────────────

class TenantSummary(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    agency_name: Optional[str] = None
    is_active: bool
    subscription_tier: str
    plan_name: Optional[str] = None
    client_count: int
    project_count: int
    message_count: int
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class SystemStats(BaseModel):
    total_tenants: int
    active_tenants: int
    total_clients: int
    total_projects: int
    total_messages: int
    total_tokens_used: int


class PlanOverrideRequest(BaseModel):
    subscription_tier: str  # "free", "pro", "enterprise"


class ImpersonateResponse(BaseModel):
    access_token: str
    token_type: str
    impersonated_user: str
    warning: str


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/tenants", response_model=List[TenantSummary], include_in_schema=False)
async def list_all_tenants(*, 
    skip: int = 0,
    limit: int = 100,
    db: Annotated[Session , Depends(get_db)],
    _: Annotated[User , Depends(require_super_admin)],
):
    """List all tenants (agency owners) with usage stats."""
    users = db.query(User).order_by(User.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for user in users:
        client_count = db.query(func.count(Client.id)).filter(Client.user_id == user.id).scalar() or 0
        project_count = db.query(func.count(Project.id)).join(
            Client, Client.id == Project.client_id
        ).filter(Client.user_id == user.id).scalar() or 0

        client_ids = [c.id for c in db.query(Client.id).filter(Client.user_id == user.id).all()]
        message_count = 0
        if client_ids:
            message_count = db.query(func.count(ChatHistory.id)).filter(
                ChatHistory.client_id.in_(client_ids)
            ).scalar() or 0

        # Get plan name from subscription
        plan_name = None
        sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
        if sub:
            plan = db.query(Plan).filter(Plan.id == sub.plan_id).first()
            if plan:
                plan_name = plan.name

        result.append(TenantSummary(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            agency_name=user.agency_name,
            is_active=user.is_active,
            subscription_tier=user.subscription_tier,
            plan_name=plan_name,
            client_count=client_count,
            project_count=project_count,
            message_count=message_count,
            created_at=user.created_at.isoformat(),
        ))

    return result


@router.get("/stats", response_model=SystemStats, include_in_schema=False)
async def get_system_stats(*, 
    db: Annotated[Session , Depends(get_db)],
    _: Annotated[User , Depends(require_super_admin)],
):
    """Get aggregate platform-wide statistics."""
    total_tenants = db.query(func.count(User.id)).scalar() or 0
    active_tenants = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0
    total_clients = db.query(func.count(Client.id)).scalar() or 0
    total_projects = db.query(func.count(Project.id)).scalar() or 0
    total_messages = db.query(func.count(ChatHistory.id)).scalar() or 0
    total_tokens = db.query(func.sum(ChatHistory.tokens_used)).scalar() or 0

    return SystemStats(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        total_clients=total_clients,
        total_projects=total_projects,
        total_messages=total_messages,
        total_tokens_used=int(total_tokens),
    )


@router.patch(
    "/users/{user_id}/plan",
    include_in_schema=False,
    responses={404: {"description": USER_NOT_FOUND}},
)
async def override_user_plan(*, 
    user_id: UUID,
    payload: PlanOverrideRequest,
    db: Annotated[Session , Depends(get_db)],
    _: Annotated[User , Depends(require_super_admin)],
):
    """Override a tenant's subscription tier (manual plan change without payment)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)

    old_tier = user.subscription_tier
    user.subscription_tier = payload.subscription_tier
    db.commit()

    logger.info(f"Super admin changed {user.email} plan: {old_tier} → {payload.subscription_tier}")
    return {"message": f"Plan updated: {old_tier} → {payload.subscription_tier}", "user": user.email}


@router.patch(
    "/users/{user_id}/disable",
    include_in_schema=False,
    responses={
        400: {"description": "Cannot disable your own account"},
        404: {"description": USER_NOT_FOUND},
    },
)
async def toggle_user_active(*, 
    user_id: UUID,
    db: Annotated[Session , Depends(get_db)],
    admin: Annotated[User , Depends(require_super_admin)],
):
    """Toggle a tenant's active status (kill switch — disables login and AI responses)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot disable your own account")

    user.is_active = not user.is_active
    db.commit()

    action = "enabled" if user.is_active else "disabled"
    logger.info(f"Super admin {action} account: {user.email}")
    return {"message": f"Account {action}", "user": user.email, "is_active": user.is_active}


@router.post(
    "/impersonate/{user_id}",
    response_model=ImpersonateResponse,
    include_in_schema=False,
    responses={
        400: {"description": "Cannot impersonate yourself"},
        404: {"description": USER_NOT_FOUND},
    },
)
async def impersonate_user(*, 
    user_id: UUID,
    db: Annotated[Session , Depends(get_db)],
    admin: Annotated[User , Depends(require_super_admin)],
):
    """
    Generate a short-lived JWT for another user (for debugging their account).
    Token expires in 15 minutes. Only use for support — all usage is logged.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot impersonate yourself")

    token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "impersonated_by": admin.email,
        },
        expires_delta=timedelta(minutes=15),
    )

    logger.warning(f"🚨 IMPERSONATION: {admin.email} → {user.email} (15min token issued)")

    return ImpersonateResponse(
        access_token=token,
        token_type="bearer",
        impersonated_user=user.email,
        warning="This token expires in 15 minutes. All actions will be logged.",
    )
