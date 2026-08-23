import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Client(Base):
    """Client model for agency's customers."""

    __tablename__ = "clients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    # Not globally unique -- two different agencies (tenants) can each have a
    # client with the same phone number. Uniqueness is enforced per-tenant by
    # the partial index below (BUG-04 in PRODUCTION_ACCEPTANCE_REPORT.md: a
    # table-wide unique constraint let one agency permanently block another
    # from ever onboarding a phone number, including a number the first
    # agency had since soft-deleted).
    phone = Column(String(50), nullable=False, index=True)
    email = Column(String(255), nullable=True)
    company = Column(String(255), nullable=True)
    telegram_chat_id = Column(String(100), nullable=True, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    __table_args__ = (
        # Partial unique index: phone must be unique per-tenant, and only
        # among non-soft-deleted rows, so a deleted client's number frees up
        # for reuse -- by the same tenant or another one.
        Index(
            "uq_clients_user_id_phone_active",
            "user_id", "phone",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
    )
    
    # Relationships
    user = relationship("User", back_populates="clients")
    projects = relationship("Project", back_populates="client", cascade="all, delete-orphan")
    chat_history = relationship("ChatHistory", back_populates="client", cascade="all, delete-orphan")
    conversation_state = relationship(
        "ConversationState", back_populates="client", uselist=False, cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<Client {self.name}>"
