import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
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
    phone = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True)
    company = Column(String(255), nullable=True)
    telegram_chat_id = Column(String(100), nullable=True, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)
    
    # Relationships
    user = relationship("User", back_populates="clients")
    projects = relationship("Project", back_populates="client", cascade="all, delete-orphan")
    chat_history = relationship("ChatHistory", back_populates="client", cascade="all, delete-orphan")
    conversation_state = relationship(
        "ConversationState", back_populates="client", uselist=False, cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<Client {self.name}>"
