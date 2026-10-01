"""Per-message conversation API — the thread and human replies.

GET  /api/v1/conversations/{client_id}/messages   thread, newest page first
POST /api/v1/conversations/{client_id}/messages   a teammate replies
"""
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.client import Client
from app.models.message import Message
from app.models.user import User
from app.rate_limit import limiter
from app.services import message_store
from app.services.channels import SUPPORTED_CHANNELS, get_adapter
from app.utils.auth import get_current_user

router = APIRouter()

MAX_PAGE = 100
MAX_BODY = 4096


class MessageOut(BaseModel):
    id: str
    client_id: str
    project_id: Optional[str] = None
    channel: str
    direction: str
    author_type: str
    author_user_id: Optional[str] = None
    body: str
    status: str
    error: Optional[str] = None
    reply_to_id: Optional[str] = None
    model_used: Optional[str] = None
    created_at: Optional[str] = None


class MessagePage(BaseModel):
    messages: List[MessageOut]  # oldest -> newest within the page
    has_more: bool              # older messages exist before this page


class SendMessageIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_BODY)
    channel: Optional[str] = None  # defaults to the channel the client last wrote on


def _owned_client(db: Session, client_id: UUID, user: User) -> Client:
    client = (
        db.query(Client)
        .filter(Client.id == client_id, Client.user_id == user.id, Client.deleted_at.is_(None))
        .first()
    )
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


@router.get("/{client_id}/messages", response_model=MessagePage)
def list_messages(
    client_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    before: Annotated[Optional[UUID], Query(description="Return messages older than this message id")] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE)] = 50,
):
    client = _owned_client(db, client_id, current_user)
    query = db.query(Message).filter(Message.client_id == client.id)
    if before is not None:
        anchor = db.query(Message).filter(Message.id == before, Message.client_id == client.id).first()
        if not anchor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        query = query.filter(
            (Message.created_at < anchor.created_at)
            | ((Message.created_at == anchor.created_at) & (Message.id < anchor.id))
        )
    rows = query.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    page = list(reversed(rows[:limit]))
    return MessagePage(messages=[MessageOut(**message_store.serialize(m)) for m in page], has_more=has_more)


@router.post("/{client_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def send_message(
    request: Request,  # required by slowapi's limiter
    client_id: UUID,
    payload: SendMessageIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    client = _owned_client(db, client_id, current_user)
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message can't be empty")

    channel = payload.channel or message_store.default_channel_for(db, client)
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{client.name} has no WhatsApp number or Telegram chat ID to message",
        )
    adapter = get_adapter(channel)
    if adapter is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported channel '{channel}'. Supported: {', '.join(SUPPORTED_CHANNELS)}",
        )
    if not adapter.address_for(client):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{client.name} has no {channel} address on file",
        )

    message = await message_store.send_agent_message(db, client, current_user.id, text, channel)
    # 201 even when delivery failed: the message exists in the thread with
    # status "failed" and an error the UI shows next to it (retryable).
    return MessageOut(**message_store.serialize(message))
