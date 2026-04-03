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
from app.services.ai_service import generate_client_response
from app.services.cache_service import get_github_stats_cached
from app.websockets.manager import manager
from app.rate_limit import limiter
from app.config import settings
from pydantic import BaseModel, ConfigDict
from typing import Annotated
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
@router.get(
    "/history/{client_id}",
    responses={404: {"description": "Client not found"}},
)
async def get_chat_history(*, 
    client_id: str,
    limit: int = 50,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """
    Get chat history for a specific client.
    Requires auth — verifies the client belongs to the authenticated user.
    """
    from app.models.user import User as _User

    # Verify ownership — prevent cross-tenant data access
    client = db.query(Client).filter(
        Client.id == client_id,
        Client.user_id == current_user.id
    ).first()

    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Bound limit to prevent abuse
    limit = min(limit, 200)

    history = db.query(ChatHistory).filter(
        ChatHistory.client_id == client_id
    ).order_by(ChatHistory.created_at.desc()).limit(limit).all()

    return {
        "client_id": client_id,
        "client_name": client.name,
        "count": len(history),
        "messages": [
            {
                "id": str(h.id),
                "message": h.message,
                "response": h.response,
                "tokens_used": h.tokens_used,
                "model_used": h.model_used,
                "created_at": h.created_at.isoformat()
            }
            for h in history
        ]
    }


@router.get("/messages")
async def get_all_messages(*, 
    skip: int = 0,
    limit: int = 50,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """
    Get all chat messages across all of the user's clients.
    Used by the frontend Messages page. Tenant-scoped.
    """
    from app.models.user import User as _User

    # Get user's client IDs
    user_client_ids = [
        c.id for c in db.query(Client.id).filter(Client.user_id == current_user.id).all()
    ]

    if not user_client_ids:
        return {"count": 0, "messages": [], "total": 0}

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

    return {
        "total": total,
        "count": len(messages),
        "messages": [
            {
                "id": str(m.id),
                "client_id": str(m.client_id),
                "client_name": clients_map.get(m.client_id, "Unknown"),
                "project_id": str(m.project_id) if m.project_id else None,
                "message": m.message,
                "response": m.response,
                "tokens_used": m.tokens_used,
                "model_used": m.model_used,
                "created_at": m.created_at.isoformat()
            }
            for m in messages
        ]
    }
