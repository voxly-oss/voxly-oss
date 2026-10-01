"""Per-message conversation API — the inbox, the thread and human replies.

GET  /api/v1/conversations                                     inbox, latest activity first
GET  /api/v1/conversations/{client_id}                          one conversation's header facts
GET  /api/v1/conversations/{client_id}/messages                 thread, newest page first
POST /api/v1/conversations/{client_id}/messages                 a teammate replies
POST /api/v1/conversations/{client_id}/messages/{id}/retry      re-send a failed message
"""
from datetime import datetime
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.api.v1.chat import _to_github_stats
from app.database import get_db
from app.models.client import Client
from app.models.conversation_state import ConversationState
from app.models.github_cache import GitHubCache
from app.models.message import Message
from app.models.user import User
from app.rate_limit import limiter
from app.schemas.conversation import ConversationStatus
from app.schemas.project import GitHubStatsSchema
from app.services import message_store
from app.services.channels import SUPPORTED_CHANNELS, get_adapter
from app.services.messaging_core import _get_client_project
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


class InboxConversation(BaseModel):
    client_id: str
    client_name: str
    channel: str                      # channel of the latest message
    last_message: MessageOut
    message_count: int
    status: Optional[ConversationStatus] = None
    # The client wrote last and nobody has answered yet — derived from the
    # thread itself; there is no per-user read tracking to build "unread" on.
    awaiting_reply: bool


class InboxPage(BaseModel):
    total: int
    conversations: List[InboxConversation]


class ConversationDetail(BaseModel):
    client_id: str
    client_name: str
    status: Optional[ConversationStatus] = None
    status_updated_at: Optional[datetime] = None
    ai_paused: bool                   # a teammate owns it; the AI won't auto-reply
    channels: List[str]               # channels this client can be messaged on
    default_channel: Optional[str] = None
    github_stats: Optional[GitHubStatsSchema] = None


def _owned_client(db: Session, client_id: UUID, user: User) -> Client:
    client = (
        db.query(Client)
        .filter(Client.id == client_id, Client.user_id == user.id, Client.deleted_at.is_(None))
        .first()
    )
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


@router.get("", response_model=InboxPage)
def list_inbox(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    search: Annotated[Optional[str], Query(max_length=200)] = None,
    status_filter: Annotated[Optional[ConversationStatus], Query(alias="status")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE)] = 30,
):
    """One row per client with at least one message, most recent activity
    first. Built on `messages`, so teammate replies and clients without a
    project show up (the chat_history-based list can't see either)."""
    owned = and_(Client.user_id == current_user.id, Client.deleted_at.is_(None))
    base = (
        db.query(
            Message.client_id.label("client_id"),
            func.max(Message.created_at).label("last_at"),
            func.count(Message.id).label("message_count"),
        )
        .join(Client, Client.id == Message.client_id)
        .filter(owned)
    )
    if status_filter:
        base = base.join(ConversationState, ConversationState.client_id == Message.client_id).filter(
            ConversationState.status == status_filter
        )
    if search and search.strip():
        like = f"%{search.strip()}%"
        body_match = (
            select(Message.client_id)
            .join(Client, Client.id == Message.client_id)
            .where(owned, Message.body.ilike(like))
        )
        base = base.filter(or_(Client.name.ilike(like), Message.client_id.in_(body_match)))
    base = base.group_by(Message.client_id)

    total = base.count()
    rows = base.order_by(func.max(Message.created_at).desc(), Message.client_id).offset(skip).limit(limit).all()
    if not rows:
        return InboxPage(total=total, conversations=[])

    ids = [r.client_id for r in rows]
    latest: dict = {}
    for m in (
        db.query(Message)
        .filter(or_(*[and_(Message.client_id == r.client_id, Message.created_at == r.last_at) for r in rows]))
        .order_by(Message.id.desc())
    ):
        latest.setdefault(m.client_id, m)
    clients = {c.id: c for c in db.query(Client).filter(Client.id.in_(ids))}
    states = {s.client_id: s for s in db.query(ConversationState).filter(ConversationState.client_id.in_(ids))}

    conversations = []
    for r in rows:
        last = latest.get(r.client_id)
        if last is None:  # created_at precision mismatch; never expected, never fatal
            continue
        state = states.get(r.client_id)
        conversations.append(InboxConversation(
            client_id=str(r.client_id),
            client_name=clients[r.client_id].name,
            channel=last.channel,
            last_message=MessageOut(**message_store.serialize(last)),
            message_count=r.message_count,
            status=state.status if state else None,
            awaiting_reply=last.direction == "inbound",
        ))
    return InboxPage(total=total, conversations=conversations)


@router.get("/{client_id}", response_model=ConversationDetail)
def get_conversation(
    client_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Header facts for one conversation — works before the first message,
    so a teammate can start a conversation from the inbox."""
    client = _owned_client(db, client_id, current_user)
    state = db.query(ConversationState).filter(ConversationState.client_id == client.id).first()
    project = _get_client_project(db, client)
    cache = db.query(GitHubCache).filter(GitHubCache.project_id == project.id).first() if project else None
    return ConversationDetail(
        client_id=str(client.id),
        client_name=client.name,
        status=state.status if state else None,
        status_updated_at=state.updated_at if state else None,
        ai_paused=message_store.ai_paused(db, client),
        channels=[name for name in SUPPORTED_CHANNELS if get_adapter(name).address_for(client)],
        default_channel=message_store.default_channel_for(db, client),
        github_stats=_to_github_stats(cache),
    )


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
            detail=f"{client.name} has no WhatsApp number, Telegram chat ID or Voxly chat link to message",
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


@router.post("/{client_id}/messages/{message_id}/retry", response_model=MessageOut)
@limiter.limit("30/minute")
async def retry_message(
    request: Request,  # required by slowapi's limiter
    client_id: UUID,
    message_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    client = _owned_client(db, client_id, current_user)
    message = db.query(Message).filter(Message.id == message_id, Message.client_id == client.id).first()
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if message.direction != "outbound" or message.status != "failed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only a failed outgoing message can be retried")
    message = await message_store.retry(db, client, message)
    return MessageOut(**message_store.serialize(message))
