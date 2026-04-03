"""
Notification API Routes

Endpoints for:
- Sending custom follow-up messages
- Viewing notification history
- Toggling auto-notifications per event type
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Annotated
from uuid import UUID

from app.database import get_db
from app.models.user import User
from app.models.client import Client
from app.services.notification_service import send_custom_message
from app.utils.auth import get_current_user
from app.rate_limit import limiter

import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class SendMessageRequest(BaseModel):
    """Schema for sending a custom follow-up message."""
    client_id: UUID
    message: str = Field(..., min_length=1, max_length=1000)


class SendMessageResponse(BaseModel):
    """Response after sending a message."""
    success: bool
    client_name: str
    message: str


@router.post(
    "/send",
    response_model=SendMessageResponse,
    responses={
        400: {"description": "Client has no phone number"},
        404: {"description": "Client not found"},
    },
)
@limiter.limit("10/minute")
async def send_follow_up(*, 
    request: SendMessageRequest,
    raw_request: Request,
    background_tasks: BackgroundTasks,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Send a custom follow-up message to a client via WhatsApp."""
    
    # Verify client belongs to user
    client = db.query(Client).filter(
        Client.id == request.client_id,
        Client.user_id == current_user.id
    ).first()
    
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if not client.phone:
        raise HTTPException(status_code=400, detail="Client has no phone number")
    
    # Send in background
    background_tasks.add_task(send_custom_message, client.phone, request.message)
    
    logger.info("Follow-up message queued for client (PII masked)")
    
    return SendMessageResponse(
        success=True,
        client_name=client.name,
        message=request.message
    )
