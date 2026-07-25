import uuid
from datetime import datetime
from sqlalchemy import Column, Float, String, Integer, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class ChatHistory(Base):
    """ChatHistory model for storing AI conversation logs."""

    __tablename__ = "chat_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    message = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    tokens_used = Column(Integer, default=0)
    model_used = Column(String(100), nullable=True)
    channel = Column(String(20), default="whatsapp", nullable=False, index=True)  # "whatsapp" | "telegram"
    created_at = Column(DateTime, default=datetime.utcnow)

    # Phase 3 Milestone 2 — real runtime metadata only, never fabricated:
    confidence = Column(Float, nullable=True)  # always NULL today — no provider or
    # runtime component computes a real confidence score anywhere in this pipeline.
    # Reserved for a future dedicated confidence-scoring mechanism; populating it
    # with a heuristic guess is explicitly out of scope.
    sentiment = Column(String(20), nullable=True)  # always NULL today, same reason
    # as confidence — no sentiment-analysis step exists in the pipeline.
    language = Column(String(5), nullable=True)  # set from the real detect_language()
    # result, but ONLY when LANGUAGE_DETECTION_ENABLED is on — the flag-off default
    # ('en') is a config fallback, not a real per-message detection, so it is NOT
    # persisted as if it were one; NULL means "not detected", not "English".
    ai_response_time_ms = Column(Integer, nullable=True)  # real, measured wall-clock
    # time across the full ai_service.py fallback chain (all attempts, not just the
    # winning one) — what the client actually waited for a reply.
    
    # Relationships
    client = relationship("Client", back_populates="chat_history")
    project = relationship("Project", back_populates="chat_history")
    
    def __repr__(self):
        return f"<ChatHistory {self.id}>"
