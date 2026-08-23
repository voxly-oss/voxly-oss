import logging
from datetime import datetime, time
from typing import Annotated, List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.client import Client
from app.models.chat_history import ChatHistory
from app.schemas.channel import ChannelActivityResponse
from app.utils.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_user_client_ids(db: Session, user_id: UUID) -> List[UUID]:
    """Get all client IDs belonging to a user. Local to this router, matching the
    same pattern already used independently in projects.py/milestones.py."""
    clients = db.query(Client.id).filter(Client.user_id == user_id).all()
    return [client.id for client in clients]


@router.get("", response_model=List[ChannelActivityResponse])
async def list_channel_activity(*,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Real per-client, per-channel message volume and last-activity, aggregated
    from chat_history. Read-only — no new table, no fabricated data.

    Only channels with real chat_history rows are returned. chat_history.channel
    is constrained to "whatsapp" and "telegram" in this schema — email is a
    one-way notification/reset channel with no persisted conversation history,
    so it is never represented here. This is a documented limitation of the
    current data model, not an omission: there is nothing to aggregate for
    email until a notification-history table exists (out of scope for this
    endpoint).
    """
    user_client_ids = _get_user_client_ids(db, current_user.id)
    if not user_client_ids:
        return []

    today_start = datetime.combine(datetime.utcnow().date(), time.min)

    rows = (
        db.query(
            ChatHistory.client_id,
            ChatHistory.channel,
            func.sum(
                case((ChatHistory.created_at >= today_start, 1), else_=0)
            ).label("volume_today"),
            func.max(ChatHistory.created_at).label("last_activity"),
        )
        .filter(ChatHistory.client_id.in_(user_client_ids))
        .group_by(ChatHistory.client_id, ChatHistory.channel)
        .all()
    )

    logger.info(
        "channel_activity_query user_id=%s clients=%d rows=%d",
        current_user.id, len(user_client_ids), len(rows),
    )

    return [
        ChannelActivityResponse(
            client_id=row.client_id,
            channel=row.channel,
            volume_today=int(row.volume_today or 0),
            last_activity=row.last_activity,
        )
        for row in rows
    ]
