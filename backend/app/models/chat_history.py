import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey
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
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    client = relationship("Client", back_populates="chat_history")
    project = relationship("Project", back_populates="chat_history")
    
    def __repr__(self):
        return f"<ChatHistory {self.id}>"
