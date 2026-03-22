import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class UserAIKey(Base):
    """Stores user-provided AI API keys for BYOK (Bring Your Own Key) mode."""
    
    __tablename__ = "user_ai_keys"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(50), nullable=False)  # "claude", "openai", "gemini"
    api_key_encrypted = Column(Text, nullable=False)  # Encrypted API key
    label = Column(String(100), nullable=True)  # e.g. "My Claude key"
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime, nullable=True)
    last_validated_at = Column(DateTime, nullable=True)
    is_valid = Column(Boolean, nullable=True)  # null = not checked, True/False = last check result
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship
    user = relationship("User", back_populates="ai_keys")
    
    def __repr__(self):
        return f"<UserAIKey {self.provider} for user {self.user_id}>"
