import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class ConversationState(Base):
    """Current backend-computed state of a client's conversation.

    One row per client (a "conversation" is scoped to a client, matching how
    the frontend already groups chat_history by client_id). Set automatically
    by messaging_core.py after each AI turn (awaiting_human/ai_handling,
    driven by the real ai_result["success"] signal), or manually by an
    authenticated user (resolved/escalated) via PATCH
    /api/v1/chat/conversations/{client_id}/status.
    """

    __tablename__ = "conversation_states"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    status = Column(String(20), nullable=False)  # awaiting_human | ai_handling | resolved | escalated
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )  # NULL when set automatically by the AI pipeline; set when a human changed it

    # Relationships
    client = relationship("Client", back_populates="conversation_state")

    def __repr__(self):
        return f"<ConversationState client={self.client_id} status={self.status}>"
