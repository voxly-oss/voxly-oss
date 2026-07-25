from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, Query, status, Response, Header
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.models.user import User
from app.utils.auth import get_current_user, get_user_from_token
from app.utils.rate_limiter import get_rate_limiter, RateLimiter
from app.models.client import Client
from app.models.project import Project
from app.models.milestone import Milestone
from app.models.chat_history import ChatHistory
from app.models.conversation_state import ConversationState
from app.schemas.conversation import (
    ConversationStateResponse,
    ConversationStateUpdate,
    ChatMessageResponse,
    ChatHistoryResponse,
    AllMessagesResponse,
    ConversationSummaryResponse,
    ConversationsListResponse,
)
from app.services.ai_service import generate_client_response
from app.services.cache_service import get_github_stats_cached
from app.services.messaging_core import upsert_conversation_state
from app.websockets.manager import manager
from app.rate_limit import limiter
from app.config import settings
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, or_, and_
from typing import Annotated, Optional
from uuid import UUID
import secrets
import logging
import json

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(*, 
    websocket: WebSocket,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time chat updates.
    Authenticated via query param `token`.
    
    FIX: Do NOT use get_db as a dependency — it holds a DB session
    for the entire WebSocket lifetime, causing connection pool exhaustion.
    Instead, create a short-lived session only for auth, then release it.
    """
    # Short-lived DB session for authentication ONLY
    db = SessionLocal()
    try:
        user = get_user_from_token(token, db)
        if not user:
            logger.warning("WebSocket connection attempt with invalid token")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        user_id = str(user.id)
        user_email = user.email
    finally:
        db.close()  # Release DB connection immediately after auth

    # Connect (no DB session held during the connection lifetime)
    await manager.connect(websocket, user_id)
    logger.info(f"WebSocket connected for user {user_email} (id={user_id})")

    try:
        while True:
            data = await websocket.receive_text()
            logger.debug(f"Received WS message from {user_email}: {data}")

            # Handle ping/pong keepalive from frontend
            try:
                parsed = json.loads(data)
                if parsed.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except (json.JSONDecodeError, TypeError):
                pass

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
        logger.info(f"WebSocket cleanly disconnected for {user_email}")

    except Exception as e:
        logger.error(f"WebSocket error for {user_email}: {e}")
        manager.disconnect(websocket, user_id)
        try:
            await websocket.close()
        except Exception:
            pass
def _to_message_response(h: ChatHistory, client_id: UUID, client_name: str) -> ChatMessageResponse:
    """Standardized per-message shape shared by /history/{client_id}, /messages,
    and /conversations' last-message fields."""
    return ChatMessageResponse(
        id=h.id,
        client_id=client_id,
        client_name=client_name,
        project_id=h.project_id,
        message=h.message,
        response=h.response,
        ai_response=h.response,
        tokens_used=h.tokens_used,
        model_used=h.model_used,
        channel=h.channel,
        confidence=h.confidence,
        sentiment=h.sentiment,
        language=h.language,
        ai_response_time_ms=h.ai_response_time_ms,
        created_at=h.created_at,
    )


@router.get(
    "/history/{client_id}",
    response_model=ChatHistoryResponse,
    responses={404: {"description": "Client not found"}},
)
async def get_chat_history(*,
    client_id: UUID,
    skip: int = 0,
    limit: int = 50,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Get chat history for a specific client — the conversation detail view.
    Requires auth — verifies the client belongs to the authenticated user.
    """
    # Verify ownership — prevent cross-tenant data access
    client = db.query(Client).filter(
        Client.id == client_id,
        Client.user_id == current_user.id
    ).first()

    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Bound pagination to prevent abuse — same bounds as /messages
    limit = min(limit, 200)
    skip = max(skip, 0)

    history = (
        db.query(ChatHistory)
        .filter(ChatHistory.client_id == client_id)
        .order_by(ChatHistory.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    state = db.query(ConversationState).filter(ConversationState.client_id == client_id).first()

    return ChatHistoryResponse(
        client_id=client.id,
        client_name=client.name,
        status=state.status if state else None,
        status_updated_at=state.updated_at if state else None,
        count=len(history),
        messages=[_to_message_response(h, client.id, client.name) for h in history],
    )


@router.get("/messages", response_model=AllMessagesResponse)
async def get_all_messages(*,
    skip: int = 0,
    limit: int = 50,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """
    Get all chat messages across all of the user's clients, flat and message-level
    paginated. Used by the frontend Messages page. Tenant-scoped.

    For conversation-level pagination/search/filtering (one row per client, not
    per message), see GET /conversations instead — this endpoint is kept
    unchanged in shape for backward compatibility with existing consumers.
    """
    # Get user's client IDs
    user_client_ids = [
        c.id for c in db.query(Client.id).filter(Client.user_id == current_user.id).all()
    ]

    if not user_client_ids:
        return AllMessagesResponse(count=0, messages=[], total=0)

    # Bound pagination to prevent abuse
    limit = min(limit, 100)
    skip = max(skip, 0)

    total = (
        db.query(ChatHistory)
        .filter(ChatHistory.client_id.in_(user_client_ids))
        .count()
    )

    messages = (
        db.query(ChatHistory)
        .filter(ChatHistory.client_id.in_(user_client_ids))
        .order_by(ChatHistory.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Fetch client names for display
    clients_map = {
        c.id: c.name
        for c in db.query(Client).filter(Client.id.in_(user_client_ids)).all()
    }

    return AllMessagesResponse(
        total=total,
        count=len(messages),
        messages=[
            _to_message_response(m, m.client_id, clients_map.get(m.client_id, "Unknown"))
            for m in messages
        ],
    )


@router.get("/conversations", response_model=ConversationsListResponse)
async def list_conversations(*,
    search: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 20,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Conversation-level list — one row per client, not per message.

    This is the real conversation grouping GET /messages never provided:
    /messages paginates at the message level, so the frontend's client-side
    grouping-into-conversations was an artifact of whatever page of raw
    messages happened to be loaded (a client's older messages could fall off
    the page entirely). This endpoint groups server-side and paginates the
    resulting conversation list itself.

    Query params:
      search: matches client name OR message text (case-insensitive substring)
      status: filter to one of awaiting_human/ai_handling/resolved/escalated
      skip, limit: pagination over conversations, not messages

    "Unread counts" (per the original milestone spec) are intentionally NOT
    included — there is no read/unread tracking anywhere in this system (no
    per-user read cursor, no read_at timestamp), so there is no real signal
    to derive a count from. Adding one would mean fabricating it.
    """
    user_client_ids = [
        c.id for c in db.query(Client.id).filter(Client.user_id == current_user.id).all()
    ]
    if not user_client_ids:
        return ConversationsListResponse(total=0, count=0, conversations=[])

    limit = min(limit, 100)
    skip = max(skip, 0)

    # Step 1: resolve the filtered set of client_ids that have >=1 message
    # and match search/status, if given.
    filtered_q = db.query(ChatHistory.client_id).filter(ChatHistory.client_id.in_(user_client_ids))
    if status_filter:
        filtered_q = filtered_q.join(
            ConversationState, ConversationState.client_id == ChatHistory.client_id
        ).filter(ConversationState.status == status_filter)
    if search:
        like = f"%{search}%"
        filtered_q = filtered_q.join(Client, Client.id == ChatHistory.client_id).filter(
            or_(Client.name.ilike(like), ChatHistory.message.ilike(like))
        )
    filtered_client_ids = [row[0] for row in filtered_q.distinct().all()]

    total = len(filtered_client_ids)
    if total == 0:
        return ConversationsListResponse(total=0, count=0, conversations=[])

    # Step 2: aggregate (count + last activity) over the filtered set, ordered
    # by most recent activity, then paginate the conversation list itself.
    aggregates = (
        db.query(
            ChatHistory.client_id,
            func.max(ChatHistory.created_at).label("last_message_at"),
            func.count(ChatHistory.id).label("message_count"),
        )
        .filter(ChatHistory.client_id.in_(filtered_client_ids))
        .group_by(ChatHistory.client_id)
        .order_by(func.max(ChatHistory.created_at).desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    page_client_ids = [a.client_id for a in aggregates]
    counts = {a.client_id: a.message_count for a in aggregates}
    last_activity = {a.client_id: a.last_message_at for a in aggregates}

    if not page_client_ids:
        return ConversationsListResponse(total=total, count=0, conversations=[])

    # Step 3: fetch the actual latest row's content for just this page (not
    # the whole filtered set) — same max(created_at)-join pattern as Step 2,
    # scoped down so this stays cheap regardless of total conversation count.
    latest_subq = (
        db.query(ChatHistory.client_id, func.max(ChatHistory.created_at).label("mx"))
        .filter(ChatHistory.client_id.in_(page_client_ids))
        .group_by(ChatHistory.client_id)
        .subquery()
    )
    latest_rows = (
        db.query(ChatHistory)
        .join(
            latest_subq,
            and_(
                ChatHistory.client_id == latest_subq.c.client_id,
                ChatHistory.created_at == latest_subq.c.mx,
            ),
        )
        .all()
    )
    latest_by_client = {}
    for row in latest_rows:
        # Ties (two rows sharing the exact same max created_at for one
        # client) keep whichever is seen first — both equally represent
        # "the latest moment", the distinction isn't meaningful here.
        latest_by_client.setdefault(row.client_id, row)

    states = {
        s.client_id: s
        for s in db.query(ConversationState).filter(ConversationState.client_id.in_(page_client_ids)).all()
    }
    clients = {
        c.id: c
        for c in db.query(Client).filter(Client.id.in_(page_client_ids)).all()
    }

    conversations = []
    for client_id in page_client_ids:
        latest = latest_by_client.get(client_id)
        state = states.get(client_id)
        client_obj = clients.get(client_id)
        conversations.append(ConversationSummaryResponse(
            client_id=client_id,
            client_name=client_obj.name if client_obj else "Unknown",
            channel=latest.channel if latest else "whatsapp",
            last_message=latest.message if latest else "",
            last_response=latest.response if latest else None,
            last_message_at=last_activity[client_id],
            message_count=counts[client_id],
            status=state.status if state else None,
            status_updated_at=state.updated_at if state else None,
            confidence=latest.confidence if latest else None,
            sentiment=latest.sentiment if latest else None,
        ))

    return ConversationsListResponse(total=total, count=len(conversations), conversations=conversations)


@router.get(
    "/conversations/{client_id}/status",
    response_model=ConversationStateResponse,
    responses={404: {"description": "Client not found, or no conversation state yet"}},
)
async def get_conversation_state(*,
    client_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Current backend-computed conversation state for a client.

    404 both when the client doesn't exist/isn't yours, and when it exists
    but has no state yet (no message has ever been processed for it) — there
    is no real value to report in that case, so we don't fabricate one.
    """
    client = db.query(Client).filter(
        Client.id == client_id, Client.user_id == current_user.id
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    state = db.query(ConversationState).filter(ConversationState.client_id == client_id).first()
    if not state:
        raise HTTPException(status_code=404, detail="No conversation state yet for this client")

    return state


@router.patch(
    "/conversations/{client_id}/status",
    response_model=ConversationStateResponse,
    responses={404: {"description": "Client not found"}},
)
async def update_conversation_state(*,
    client_id: UUID,
    body: ConversationStateUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Manually set a client's conversation state (e.g. mark resolved/escalated).

    Pydantic's Literal type on ConversationStateUpdate.status already rejects
    any value outside awaiting_human/ai_handling/resolved/escalated with a 422
    before this handler runs.
    """
    client = db.query(Client).filter(
        Client.id == client_id, Client.user_id == current_user.id
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    state = upsert_conversation_state(
        db, client.id, body.status, updated_by_user_id=current_user.id
    )
    logger.info(
        "Conversation state manually set to %s for client=%s by user=%s",
        body.status, client_id, current_user.id,
    )
    return state
