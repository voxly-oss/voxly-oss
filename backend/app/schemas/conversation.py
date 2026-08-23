from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID
from pydantic import BaseModel

from app.schemas.project import GitHubStatsSchema

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


class ChatMessageResponse(BaseModel):
    """One chat_history row, standardized shape shared by GET /history/{client_id}
    GET /messages, and GET /conversations' last-message fields."""
    id: UUID
    client_id: UUID
    client_name: str
    project_id: Optional[UUID] = None
    message: str
    response: str  # kept for backward compatibility with existing consumers
    ai_response: str  # NEW — additive alias of `response`. The frontend's
    # ChatMessage interface has always read `m.ai_response`, but the backend
    # has only ever sent `response`; that silent key mismatch meant the AI's
    # reply never rendered in the Conversation Center. Fixed by adding the
    # field consumers actually expect, without removing or renaming the
    # original — anything reading `.response` today is unaffected.
    tokens_used: int
    model_used: Optional[str] = None
    channel: str
    confidence: Optional[float] = None
    sentiment: Optional[str] = None
    language: Optional[str] = None
    ai_response_time_ms: Optional[int] = None
    created_at: datetime


class ChatHistoryResponse(BaseModel):
    """GET /api/v1/chat/history/{client_id}"""
    client_id: UUID
    client_name: str
    status: Optional[ConversationStatus] = None  # real backend state (Milestone 1),
    # None when no state has been computed yet for this client
    status_updated_at: Optional[datetime] = None
    count: int
    messages: List[ChatMessageResponse]
    github_stats: Optional[GitHubStatsSchema] = None  # Milestone 5 — the
    # conversation's relevant project's real synced GitHub stats (same
    # github_cache table Project.github_stats already reads — no new fetch,
    # no new cache). None when the client has no project, the project has no
    # github_repo, or it hasn't synced yet.


class AllMessagesResponse(BaseModel):
    """GET /api/v1/chat/messages"""
    total: int
    count: int
    messages: List[ChatMessageResponse]


class ConversationSummaryResponse(BaseModel):
    """One row per client with at least one message — GET /api/v1/chat/conversations."""
    client_id: UUID
    client_name: str
    channel: str  # the most recent message's channel; a "conversation" here is
    # scoped per-client (matching how the frontend already groups), so this is
    # representative of the latest turn, not necessarily every channel ever used
    last_message: str
    last_response: Optional[str] = None
    last_message_at: datetime
    message_count: int  # real COUNT(*) of chat_history rows for this client
    status: Optional[ConversationStatus] = None
    status_updated_at: Optional[datetime] = None
    confidence: Optional[float] = None
    sentiment: Optional[str] = None
    github_stats: Optional[GitHubStatsSchema] = None  # Milestone 5, same source/semantics as ChatHistoryResponse.github_stats above


class ConversationsListResponse(BaseModel):
    """GET /api/v1/chat/conversations"""
    total: int  # distinct conversations matching the current filters, for real pagination
    count: int
    conversations: List[ConversationSummaryResponse]
