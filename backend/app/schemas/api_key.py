from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


# --- API Key Schemas ---

class APIKeyCreate(BaseModel):
    """Schema for creating a new API key."""
    label: str = Field(..., min_length=1, max_length=100, description="Human-readable label for the key")
    scopes: List[str] = Field(
        default=["clients:read", "projects:read", "milestones:read", "chat:read"],
        description="Permission scopes for the key"
    )
    expires_at: Optional[datetime] = Field(None, description="Optional expiration date")


class APIKeyUpdate(BaseModel):
    """Schema for updating an API key."""
    label: Optional[str] = Field(None, min_length=1, max_length=100)
    scopes: Optional[List[str]] = None


class APIKeyResponse(BaseModel):
    """Schema for API key details (without the full key)."""
    id: UUID
    key_prefix: str
    label: str
    scopes: List[str]
    is_active: bool
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    revoked_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class APIKeyCreatedResponse(APIKeyResponse):
    """Schema returned when a new key is created — includes the full key (shown once)."""
    key: str = Field(..., description="Full API key — shown only once, save it securely")


class APIKeyListResponse(BaseModel):
    """Schema for listing API keys."""
    keys: List[APIKeyResponse]
    total: int
    max_allowed: int
