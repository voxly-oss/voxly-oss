import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, Integer, DateTime, Date, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Milestone(Base):
    """Milestone model for project milestones and progress tracking."""
    
    __tablename__ = "milestones"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="pending")  # pending, in_progress, completed, blocked
    progress = Column(Integer, default=0)  # 0-100
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="milestones")
    
    def __repr__(self):
        return f"<Milestone {self.title}>"
