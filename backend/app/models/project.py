import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, Boolean, DateTime, Date, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Project(Base):
    """Project model for client projects with GitHub integration."""
    
    __tablename__ = "projects"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    github_repo = Column(String(255), nullable=True)  # Format: "owner/repo"
    github_sync_enabled = Column(Boolean, default=True)
    status = Column(String(50), default="active")  # active, paused, completed, cancelled
    start_date = Column(Date, nullable=True)
    expected_end_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)
    
    # Relationships
    client = relationship("Client", back_populates="projects")
    milestones = relationship("Milestone", back_populates="project", cascade="all, delete-orphan")
    chat_history = relationship("ChatHistory", back_populates="project")
    github_cache = relationship("GitHubCache", back_populates="project", uselist=False, cascade="all, delete-orphan")

    @property
    def github_stats(self):
        """Alias for github_cache, matching ProjectResponse's `github_stats` field name."""
        return self.github_cache

    def __repr__(self):
        return f"<Project {self.name}>"
