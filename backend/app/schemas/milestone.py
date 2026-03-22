from datetime import datetime, date
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class MilestoneBase(BaseModel):
    """Base milestone schema with common fields."""
    title: str
    description: Optional[str] = None
    status: str = "pending"
    progress: int = Field(default=0, ge=0, le=100)
    due_date: Optional[date] = None


class MilestoneCreate(MilestoneBase):
    """Schema for creating a milestone."""
    project_id: UUID


class MilestoneUpdate(BaseModel):
    """Schema for updating a milestone."""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    due_date: Optional[date] = None
    completed_at: Optional[datetime] = None


class MilestoneResponse(MilestoneBase):
    """Schema for milestone response."""
    id: UUID
    project_id: UUID
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
