from datetime import datetime, date
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class ProjectBase(BaseModel):
    """Base project schema with common fields."""
    name: str
    description: Optional[str] = None
    github_repo: Optional[str] = None
    github_sync_enabled: bool = True
    status: str = "active"
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""
    client_id: UUID


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: Optional[str] = None
    description: Optional[str] = None
    github_repo: Optional[str] = None
    github_sync_enabled: Optional[bool] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None


class ProjectResponse(ProjectBase):
    """Schema for project response."""
    id: UUID
    client_id: UUID
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ProjectWithMilestones(ProjectResponse):
    """Schema for project with nested milestones."""
    milestones: list = []
    
    model_config = ConfigDict(from_attributes=True)
