from datetime import datetime
from typing import Literal, Optional
from uuid import UUID
from pydantic import BaseModel

ConversationStatus = Literal["awaiting_human", "ai_handling", "resolved", "escalated"]


class ConversationStateResponse(BaseModel):
    """Current backend-computed state of a client's conversation."""
    client_id: UUID
    status: ConversationStatus
    updated_at: Optional[datetime] = None
    updated_by_user_id: Optional[UUID] = None  # None = set automatically by the AI pipeline

    model_config = {"from_attributes": True}


class ConversationStateUpdate(BaseModel):
    """Manual state transition, e.g. an agency user marking a conversation resolved/escalated."""
    status: ConversationStatus
