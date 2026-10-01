"""The native Voxly channel: a client's personal chat link.

Agency side (mounted under /api/v1/clients, agency auth):
  GET    /{client_id}/chat-link     the active link, if any
  POST   /{client_id}/chat-link     create one (regenerating revokes the old one)
  DELETE /{client_id}/chat-link     revoke it — every session from it ends now

Client side (mounted under /api/v1/portal, portal session auth):
  POST /session        exchange the link token for a 30-day device session
  GET  /me             who this chat is with
  GET  /messages       the client's thread, newest page first
  POST /messages       the client writes; the AI answers unless a teammate owns it
  WS   /ws?token=      live messages for this client only
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import (
    APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, WebSocket,
    WebSocketDisconnect, status,
)
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.v1.chat import _WS_RECEIVE_TIMEOUT_SECONDS
from app.api.v1.messages import MAX_BODY, MAX_PAGE, _owned_client
from app.database import SessionLocal, get_db
from app.models.client import Client
from app.models.client_chat_link import ClientChatLink
from app.models.message import Message
from app.models.organization import Organization
from app.models.user import User
from app.rate_limit import limiter
from app.services import message_store
from app.services.messaging_core import _get_client_project, process_incoming_message
from app.services.portal_auth import (
    PortalContext, active_link, create_session_token, device_label, get_portal_context, link_url,
    live_client, parse_link_token, resolve_session,
)
from app.utils.auth import get_current_user
from app.websockets.manager import portal_manager

logger = logging.getLogger(__name__)

agency_router = APIRouter()
router = APIRouter()


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() + "Z" if value else None


# ── Agency side ──────────────────────────────────────────────────────────────


class ChatLinkOut(BaseModel):
    active: bool
    url: Optional[str] = None
    created_at: Optional[str] = None
    last_opened_at: Optional[str] = None
    last_opened_device: Optional[str] = None


def _current_link(db: Session, client_id: UUID) -> Optional[ClientChatLink]:
    return (
        db.query(ClientChatLink)
        .filter(ClientChatLink.client_id == client_id, ClientChatLink.revoked_at.is_(None))
        .order_by(ClientChatLink.created_at.desc())
        .first()
    )


def _link_out(link: Optional[ClientChatLink]) -> ChatLinkOut:
    if link is None:
        return ChatLinkOut(active=False)
    return ChatLinkOut(
        active=True,
        url=link_url(link),
        created_at=_iso(link.created_at),
        last_opened_at=_iso(link.last_opened_at),
        last_opened_device=link.last_opened_device,
    )


def _revoke_all(db: Session, client_id: UUID) -> int:
    now = datetime.utcnow()
    links = db.query(ClientChatLink).filter(ClientChatLink.client_id == client_id, ClientChatLink.revoked_at.is_(None)).all()
    for link in links:
        link.revoked_at = now
    return len(links)


@agency_router.get("/{client_id}/chat-link", response_model=ChatLinkOut)
def get_chat_link(
    client_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    client = _owned_client(db, client_id, current_user)
    return _link_out(_current_link(db, client.id))


@agency_router.post("/{client_id}/chat-link", response_model=ChatLinkOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_chat_link(
    request: Request,  # required by slowapi's limiter
    client_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Create the client's chat link. If one exists it is revoked first, so
    "regenerate" is the way to cut off a link that was forwarded."""
    client = _owned_client(db, client_id, current_user)
    _revoke_all(db, client.id)
    link = ClientChatLink(client_id=client.id, created_by_user_id=current_user.id)
    db.add(link)
    db.commit()
    db.refresh(link)
    await portal_manager.close_all(str(client.id))
    return _link_out(link)


@agency_router.delete("/{client_id}/chat-link", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_chat_link(
    client_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    client = _owned_client(db, client_id, current_user)
    if _revoke_all(db, client.id) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This client has no active chat link")
    db.commit()
    await portal_manager.close_all(str(client.id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Client side ──────────────────────────────────────────────────────────────


class PortalProfile(BaseModel):
    client_id: str
    client_name: str
    agency_name: str


class SessionIn(BaseModel):
    token: str = Field(..., min_length=10, max_length=200)


class SessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    profile: PortalProfile


class PortalMessage(BaseModel):
    id: str
    direction: str       # inbound = written by the client
    author_type: str     # client | ai | agent
    channel: str
    body: str
    status: str
    created_at: Optional[str] = None


class PortalMessagePage(BaseModel):
    messages: List[PortalMessage]  # oldest -> newest within the page
    has_more: bool


class PortalSendIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_BODY)


def _profile(db: Session, client: Client) -> PortalProfile:
    agency = None
    if client.org_id:
        org = db.get(Organization, client.org_id)
        agency = org.name if org else None
    if not agency:
        owner = db.get(User, client.user_id)
        agency = (owner.agency_name or owner.full_name) if owner else None
    return PortalProfile(client_id=str(client.id), client_name=client.name, agency_name=agency or "Your agency")


@router.post("/session", response_model=SessionOut)
@limiter.limit("10/minute")
async def open_session(
    request: Request,  # required by slowapi's limiter
    payload: SessionIn,
    db: Annotated[Session, Depends(get_db)],
):
    link_id = parse_link_token(payload.token)
    link = active_link(db, link_id) if link_id else None
    client = live_client(db, link.client_id) if link else None
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This chat link isn't active anymore. Ask your agency for a new one.",
        )
    link.last_opened_at = datetime.utcnow()
    link.last_opened_device = device_label(request.headers.get("user-agent"))
    db.commit()
    token, expires_in = create_session_token(link)
    return SessionOut(access_token=token, expires_in=expires_in, profile=_profile(db, client))


@router.get("/me", response_model=PortalProfile)
def portal_me(
    context: Annotated[PortalContext, Depends(get_portal_context)],
    db: Annotated[Session, Depends(get_db)],
):
    return _profile(db, context.client)


# Mirrors message_store.visible_to_client, as a query filter.
_VISIBLE = or_(Message.direction == "inbound", Message.status == "sent")


@router.get("/messages", response_model=PortalMessagePage)
def portal_messages(
    context: Annotated[PortalContext, Depends(get_portal_context)],
    db: Annotated[Session, Depends(get_db)],
    before: Annotated[Optional[UUID], Query(description="Return messages older than this message id")] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE)] = 50,
):
    query = db.query(Message).filter(Message.client_id == context.client.id, _VISIBLE)
    if before is not None:
        anchor = query.filter(Message.id == before).first()
        if not anchor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        query = query.filter(
            (Message.created_at < anchor.created_at)
            | ((Message.created_at == anchor.created_at) & (Message.id < anchor.id))
        )
    rows = query.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit + 1).all()
    page = list(reversed(rows[:limit]))
    return PortalMessagePage(
        messages=[PortalMessage(**message_store.serialize_for_client(m)) for m in page],
        has_more=len(rows) > limit,
    )


async def _answer(client_id: UUID, message_id: UUID) -> None:
    """Run the AI pipeline for a portal message after the request returns."""
    db = SessionLocal()
    try:
        client = db.get(Client, client_id)
        inbound = db.get(Message, message_id)
        if client is not None and inbound is not None:
            await process_incoming_message(channel="voxly", client=client, message=inbound.body, inbound=inbound)
    except Exception as exc:  # never let a background failure surface as a crash
        logger.error("[VOXLY] pipeline failed for client=%s: %s", client_id, exc, exc_info=True)
    finally:
        db.close()


@router.post("/messages", response_model=PortalMessage, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def portal_send(
    request: Request,  # required by slowapi's limiter
    payload: PortalSendIn,
    background_tasks: BackgroundTasks,
    context: Annotated[PortalContext, Depends(get_portal_context)],
    db: Annotated[Session, Depends(get_db)],
):
    """Save and acknowledge the client's message now; the reply (AI, or a
    teammate's from the inbox) arrives over the socket."""
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message can't be empty")
    client = context.client
    inbound = message_store.record_inbound(db, client, "voxly", text, project=_get_client_project(db, client))
    await message_store.broadcast_message(client, inbound)
    background_tasks.add_task(_answer, client.id, inbound.id)
    return PortalMessage(**message_store.serialize_for_client(inbound))


@router.websocket("/ws")
async def portal_socket(websocket: WebSocket, token: str = Query(...)):
    """Live messages for one client. Auth uses a short-lived DB session that
    is released before the socket starts (no pool exhaustion), same as the
    agency socket. Revoking the link closes these sockets."""
    db = SessionLocal()
    try:
        context = resolve_session(db, token)
        key = str(context.client.id) if context else None
    finally:
        db.close()
    if key is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await portal_manager.connect(websocket, key)
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=_WS_RECEIVE_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                portal_manager.disconnect(websocket, key)
                try:
                    await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)
                except Exception:
                    pass
                return
            try:
                if json.loads(data).get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except (json.JSONDecodeError, TypeError, AttributeError):
                continue
    except WebSocketDisconnect:
        portal_manager.disconnect(websocket, key)
    except Exception as exc:
        logger.error("Portal socket error for client=%s: %s", key, exc)
        portal_manager.disconnect(websocket, key)
        try:
            await websocket.close()
        except Exception:
            pass
