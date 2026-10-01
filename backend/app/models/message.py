import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Message(Base):
    """One message in a client's conversation — inbound or outbound, on any
    channel, written by the client, the AI, or a human agent.

    Replaces the pair-shaped ChatHistory (one row = a client message AND the
    AI's reply, both required), which could not represent a human reply, an
    AI-paused inbound message, an agent-initiated message, or delivery state.
    ChatHistory is still dual-written so existing stats keep working until
    they are migrated; existing rows are backfilled into this table.
    """

    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)

    channel = Column(String(20), nullable=False)        # whatsapp | telegram (later: voxly, slack, …)
    direction = Column(String(10), nullable=False)      # inbound | outbound
    author_type = Column(String(10), nullable=False)    # client | ai | agent
    author_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    body = Column(Text, nullable=False)
    # inbound: received. outbound: queued -> sent | failed. (delivered/read
    # arrive with provider status webhooks; nothing reports them yet.)
    status = Column(String(12), nullable=False)
    error = Column(Text, nullable=True)
    external_id = Column(String(255), nullable=True)    # provider message id, when a provider returns one

    reply_to_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    model_used = Column(String(100), nullable=True)
    tokens_used = Column(Integer, nullable=True)
    ai_response_time_ms = Column(Integer, nullable=True)
    language = Column(String(5), nullable=True)

    # Backfill idempotency: the chat_history row this message was split from.
    legacy_chat_history_id = Column(UUID(as_uuid=True), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    client = relationship("Client")

    __table_args__ = (
        Index("ix_messages_client_created", "client_id", "created_at"),
        Index("ix_messages_legacy_chat_history_id", "legacy_chat_history_id"),
    )

    def __repr__(self):
        return f"<Message {self.direction}/{self.author_type} {self.channel} {self.status}>"
