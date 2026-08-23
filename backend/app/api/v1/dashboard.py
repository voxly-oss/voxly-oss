"""
Dashboard API Routes

Aggregated statistics endpoint for the authenticated user's dashboard.
All data is scoped to the authenticated user — no cross-tenant leakage.
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.client import Client
from app.models.project import Project
from app.models.chat_history import ChatHistory
from app.utils.auth import get_current_user

import logging

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Response schemas ──

class DailyMessageCount(BaseModel):
    date: str
    count: int


class RecentActivity(BaseModel):
    type: str          # "client_added" | "project_created" | "message_received"
    title: str
    timestamp: str


class RecentAIMessage(BaseModel):
    client_name: str
    provider: str       # "gemini", "openai", etc.
    response_length: int
    timestamp: str


class IntegrationStatus(BaseModel):
    whatsapp: bool
    telegram: bool
    github: bool
    ai_provider: str    # "gemini" | "openai" | "none"


class DashboardStatsResponse(BaseModel):
    # Core counts
    total_clients: int
    active_clients: int
    total_projects: int
    active_projects: int
    completed_projects: int
    total_messages: int
    messages_this_month: int
    messages_last_month: int

    # Real trend deltas (vs prior month)
    clients_delta: int          # new clients this month vs last month
    projects_delta: int         # new projects this month vs last month
    messages_delta_pct: float   # % change in messages month-over-month

    # Charts & feeds
    messages_by_day: List[DailyMessageCount]
    recent_activity: List[RecentActivity]
    recent_ai_messages: List[RecentAIMessage]

    # Integration status
    integrations: IntegrationStatus

    # Kept for backward compat but now computed from real data
    ai_accuracy: float


def _get_user_client_ids(db: Session, user_id) -> List:
    return [
        c.id for c in db.query(Client.id)
        .filter(Client.user_id == user_id, Client.deleted_at.is_(None))
        .all()
    ]


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _month_range(offset_months: int = 0):
    """Return (start, end) UTC datetimes for a month. offset_months=0 = current, -1 = last."""
    now = _now_utc()
    # Move back by offset_months
    month = now.month + offset_months
    year = now.year
    while month <= 0:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    start = now.replace(year=year, month=month, day=1, hour=0, minute=0, second=0, microsecond=0)
    # End = start of next month
    next_month = month + 1
    next_year = year
    if next_month > 12:
        next_month = 1
        next_year += 1
    end = start.replace(year=next_year, month=next_month, day=1)
    return start, end


def _get_project_stats(db: Session, user_client_ids: List) -> tuple[int, int, int]:
    if not user_client_ids:
        return 0, 0, 0

    project_query = db.query(Project).filter(
        Project.client_id.in_(user_client_ids), Project.deleted_at.is_(None)
    )
    return (
        project_query.count(),
        project_query.filter(Project.status == "active").count(),
        project_query.filter(Project.status == "completed").count(),
    )


def _get_message_stats(db: Session, user_client_ids: List) -> tuple[int, int, int]:
    """Returns (total, this_month, last_month)."""
    if not user_client_ids:
        return 0, 0, 0

    total_messages = (
        db.query(func.count(ChatHistory.id))
        .filter(ChatHistory.client_id.in_(user_client_ids))
        .scalar()
    ) or 0

    cur_start, cur_end = _month_range(0)
    messages_this_month = (
        db.query(func.count(ChatHistory.id))
        .filter(
            ChatHistory.client_id.in_(user_client_ids),
            ChatHistory.created_at >= cur_start,
            ChatHistory.created_at < cur_end,
        )
        .scalar()
    ) or 0

    prev_start, prev_end = _month_range(-1)
    messages_last_month = (
        db.query(func.count(ChatHistory.id))
        .filter(
            ChatHistory.client_id.in_(user_client_ids),
            ChatHistory.created_at >= prev_start,
            ChatHistory.created_at < prev_end,
        )
        .scalar()
    ) or 0

    return total_messages, messages_this_month, messages_last_month


def _get_client_delta(db: Session, user_id) -> int:
    """New clients added this month vs last month."""
    cur_start, cur_end = _month_range(0)
    prev_start, prev_end = _month_range(-1)
    this_month = (
        db.query(func.count(Client.id))
        .filter(
            Client.user_id == user_id, Client.deleted_at.is_(None),
            Client.created_at >= cur_start, Client.created_at < cur_end,
        )
        .scalar()
    ) or 0
    last_month = (
        db.query(func.count(Client.id))
        .filter(
            Client.user_id == user_id, Client.deleted_at.is_(None),
            Client.created_at >= prev_start, Client.created_at < prev_end,
        )
        .scalar()
    ) or 0
    return this_month - last_month


def _get_project_delta(db: Session, user_client_ids: List) -> int:
    if not user_client_ids:
        return 0
    cur_start, cur_end = _month_range(0)
    prev_start, prev_end = _month_range(-1)
    this_month = (
        db.query(func.count(Project.id))
        .filter(
            Project.client_id.in_(user_client_ids), Project.deleted_at.is_(None),
            Project.created_at >= cur_start, Project.created_at < cur_end,
        )
        .scalar()
    ) or 0
    last_month = (
        db.query(func.count(Project.id))
        .filter(
            Project.client_id.in_(user_client_ids), Project.deleted_at.is_(None),
            Project.created_at >= prev_start, Project.created_at < prev_end,
        )
        .scalar()
    ) or 0
    return this_month - last_month


def _calculate_ai_accuracy(db: Session, user_client_ids: List, total_messages: int) -> float:
    if not user_client_ids or total_messages <= 0:
        return 0.0

    failed = (
        db.query(func.count(ChatHistory.id))
        .filter(
            ChatHistory.client_id.in_(user_client_ids),
            ChatHistory.model_used == "no_project",
        )
        .scalar()
    ) or 0
    if total_messages <= failed:
        return 0.0
    return round(((total_messages - failed) / total_messages) * 100, 1)


def _build_messages_by_day(db: Session, user_client_ids: List) -> List[DailyMessageCount]:
    messages_by_day: List[DailyMessageCount] = []
    for i in range(6, -1, -1):
        day = _now_utc().date() - timedelta(days=i)
        day_start = datetime.combine(day, datetime.min.time())
        day_end = day_start + timedelta(days=1)
        count = 0
        if user_client_ids:
            count = (
                db.query(func.count(ChatHistory.id))
                .filter(
                    ChatHistory.client_id.in_(user_client_ids),
                    ChatHistory.created_at >= day_start,
                    ChatHistory.created_at < day_end,
                )
                .scalar()
            ) or 0
        messages_by_day.append(DailyMessageCount(date=day.isoformat(), count=count))
    return messages_by_day


def _build_recent_activity(
    db: Session,
    client_query,
    user_client_ids: List,
) -> List[RecentActivity]:
    recent_activity: List[RecentActivity] = []
    recent_clients = client_query.order_by(Client.created_at.desc()).limit(3).all()
    for client in recent_clients:
        recent_activity.append(
            RecentActivity(
                type="client_added",
                title=f"Added client: {client.name}",
                timestamp=client.created_at.isoformat(),
            )
        )

    if user_client_ids:
        recent_projects = (
            db.query(Project)
            .filter(Project.client_id.in_(user_client_ids), Project.deleted_at.is_(None))
            .order_by(Project.created_at.desc())
            .limit(3)
            .all()
        )
        for project in recent_projects:
            recent_activity.append(
                RecentActivity(
                    type="project_created",
                    title=f"Created project: {project.name}",
                    timestamp=project.created_at.isoformat(),
                )
            )

    recent_activity.sort(key=lambda activity: activity.timestamp, reverse=True)
    return recent_activity[:5]


def _build_recent_ai_messages(db: Session, user_client_ids: List) -> List[RecentAIMessage]:
    """Last 5 AI interactions — metadata only, no message content (privacy-first)."""
    if not user_client_ids:
        return []

    # Build a client_id → name lookup to avoid N+1
    clients = db.query(Client.id, Client.name).filter(Client.id.in_(user_client_ids)).all()
    client_name_map = {str(c.id): c.name for c in clients}

    recent = (
        db.query(ChatHistory)
        .filter(ChatHistory.client_id.in_(user_client_ids))
        .order_by(ChatHistory.created_at.desc())
        .limit(5)
        .all()
    )

    result = []
    for msg in recent:
        result.append(RecentAIMessage(
            client_name=client_name_map.get(str(msg.client_id), "Unknown"),
            provider=msg.model_used or "unknown",
            response_length=len(msg.response or "") if msg.response else 0,
            timestamp=msg.created_at.isoformat(),
        ))
    return result


def _build_integration_status(current_user: User) -> IntegrationStatus:
    """Check which integrations are configured for this user."""
    # WhatsApp: Twilio is platform-wide, but we check if the user has any WA-sourced messages
    # For now: use platform-level config as proxy
    whatsapp_ready = bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN)
    telegram_ready = bool(settings.TELEGRAM_BOT_TOKEN)
    github_ready = bool(settings.GITHUB_TOKEN)

    # AI provider: check what's configured
    if settings.GEMINI_API_KEY:
        ai_provider = "gemini"
    elif settings.OPENAI_API_KEY:
        ai_provider = "openai"
    else:
        ai_provider = "none"

    return IntegrationStatus(
        whatsapp=whatsapp_ready,
        telegram=telegram_ready,
        github=github_ready,
        ai_provider=ai_provider,
    )


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(*,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Get aggregated dashboard statistics for the authenticated user.

    Data is strictly scoped to the user's own clients/projects — no
    cross-tenant data is ever exposed. All trend deltas are real computed values.
    """
    user_id = current_user.id

    # ── Client stats (soft-deleted clients must never count) ──
    client_query = db.query(Client).filter(
        Client.user_id == user_id, Client.deleted_at.is_(None)
    )
    total_clients = client_query.count()
    active_clients = client_query.filter(Client.is_active == True).count()  # noqa: E712

    # ── Project stats (via user's clients) ──
    user_client_ids = _get_user_client_ids(db, user_id)
    total_projects, active_projects, completed_projects = _get_project_stats(db, user_client_ids)

    # ── Message stats with real month comparison ──
    total_messages, messages_this_month, messages_last_month = _get_message_stats(db, user_client_ids)

    # ── Real trend deltas ──
    clients_delta = _get_client_delta(db, user_id)
    projects_delta = _get_project_delta(db, user_client_ids)

    # Messages % change month-over-month
    if messages_last_month > 0:
        messages_delta_pct = round(((messages_this_month - messages_last_month) / messages_last_month) * 100, 1)
    elif messages_this_month > 0:
        messages_delta_pct = 100.0   # first month with any messages
    else:
        messages_delta_pct = 0.0

    ai_accuracy = _calculate_ai_accuracy(db, user_client_ids, total_messages)
    messages_by_day = _build_messages_by_day(db, user_client_ids)
    recent_activity = _build_recent_activity(db, client_query, user_client_ids)
    recent_ai_messages = _build_recent_ai_messages(db, user_client_ids)
    integrations = _build_integration_status(current_user)

    return DashboardStatsResponse(
        total_clients=total_clients,
        active_clients=active_clients,
        total_projects=total_projects,
        active_projects=active_projects,
        completed_projects=completed_projects,
        total_messages=total_messages,
        messages_this_month=messages_this_month,
        messages_last_month=messages_last_month,
        clients_delta=clients_delta,
        projects_delta=projects_delta,
        messages_delta_pct=messages_delta_pct,
        messages_by_day=messages_by_day,
        recent_activity=recent_activity,
        recent_ai_messages=recent_ai_messages,
        integrations=integrations,
        ai_accuracy=ai_accuracy,
    )
