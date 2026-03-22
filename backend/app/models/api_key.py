import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class APIKey(Base):
    """User API keys for programmatic access."""
    
    __tablename__ = "api_keys"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Key storage — only hash is stored, never plaintext
    key_hash = Column(String(255), nullable=False)
    key_prefix = Column(String(20), nullable=False, index=True)  # "pv_live_a1b2c3d4" for lookup
    
    # Metadata
    label = Column(String(100), nullable=False)  # "Production", "Staging", "CI/CD"
    scopes = Column(JSON, default=list)  # ["clients:read", "projects:write", ...]
    
    # Status
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="api_keys")
    usage_logs = relationship("UsageLog", back_populates="api_key", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<APIKey {self.key_prefix}... ({self.label})>"
