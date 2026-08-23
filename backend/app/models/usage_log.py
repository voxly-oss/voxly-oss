import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, Integer, DateTime, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class UsageLog(Base):
    """API usage tracking per key per day."""
    
    __tablename__ = "usage_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=True, index=True)
    api_key_id = Column(UUID(as_uuid=True), ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=True, index=True)
    
    # Usage data
    date = Column(Date, default=date.today, nullable=False, index=True)
    endpoint = Column(String(255), nullable=True)
    method = Column(String(10), nullable=True)  # GET, POST, PUT, DELETE
    request_count = Column(Integer, default=1)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="usage_logs")
    api_key = relationship("APIKey", back_populates="usage_logs")
    
    def __repr__(self):
        return f"<UsageLog {self.date} - {self.endpoint} ({self.request_count})>"
