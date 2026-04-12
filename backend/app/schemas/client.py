from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, ConfigDict


class ClientBase(BaseModel):
    """Base client schema with common fields."""
    name: str
    phone: str
    email: Optional[EmailStr] = None
    company: Optional[str] = None
    telegram_chat_id: Optional[str] = None


class ClientCreate(ClientBase):
    """Schema for creating a client."""
    pass


class ClientUpdate(BaseModel):
    """Schema for updating a client."""
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    company: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    is_active: Optional[bool] = None


class ClientResponse(ClientBase):
    """Schema for client response."""
    id: UUID
    user_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ClientWithProjects(ClientResponse):
    """Schema for client with nested projects."""
    projects: list = []
    
    model_config = ConfigDict(from_attributes=True)
