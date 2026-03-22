from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
from datetime import datetime


class GitHubCache(Base):
    __tablename__ = "github_cache"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(
        UUID(as_uuid=True), 
        ForeignKey('projects.id', ondelete='CASCADE'), 
        unique=True, 
        nullable=False, 
        index=True
    )
    commits_count = Column(Integer, default=0)
    commits_last_7_days = Column(Integer, default=0)
    open_issues = Column(Integer, default=0)
    closed_issues = Column(Integer, default=0)
    pull_requests = Column(Integer, default=0)
    last_commit_message = Column(String)
    last_commit_date = Column(DateTime)
    progress_percent = Column(Integer, default=0)
    synced_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationship
    project = relationship("Project", back_populates="github_cache")
