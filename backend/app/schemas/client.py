from datetime import datetime
from typing import Optional
from uuid import UUID
import phonenumbers
from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator

# Matches the clients.phone / clients.name / clients.company column widths
# (String(255) / String(255) / String(255)) — an over-length value used to
# reach the DB unvalidated and come back as an unhandled 500 DataError.
_NAME_MAX_LENGTH = 255
_COMPANY_MAX_LENGTH = 255


def _normalize_phone(v: str) -> str:
    """Reject input that isn't phone-number-shaped and store it in a single
    canonical E.164 form, so two different-looking inputs for the same number
    can never both be accepted as distinct clients.

    Uses is_possible_number() (length/format plausible for the region) rather
    than is_valid_number() (matches an actually-allocated carrier range):
    the latter is too strict for real-world input -- number ranges get
    reallocated over time, and it rejects synthetic-but-well-formed numbers
    that are exactly what an over-length/garbage-input guard should let
    through unmolested. It still rejects the actual bug case ("12345" used to
    return 201)."""
    v = v.strip()
    try:
        parsed = phonenumbers.parse(v, "IN")
    except phonenumbers.NumberParseException as exc:
        raise ValueError(f"'{v}' is not a valid phone number") from exc
    if not phonenumbers.is_possible_number(parsed):
        raise ValueError(f"'{v}' is not a valid phone number")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


class ClientBase(BaseModel):
    """Base client schema with common fields."""
    name: str = Field(..., min_length=1, max_length=_NAME_MAX_LENGTH)
    phone: str
    email: Optional[EmailStr] = None
    company: Optional[str] = Field(None, max_length=_COMPANY_MAX_LENGTH)
    telegram_chat_id: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str) -> str:
        return _normalize_phone(v)


class ClientCreate(ClientBase):
    """Schema for creating a client."""
    pass


class ClientUpdate(BaseModel):
    """Schema for updating a client."""
    name: Optional[str] = Field(None, min_length=1, max_length=_NAME_MAX_LENGTH)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    company: Optional[str] = Field(None, max_length=_COMPANY_MAX_LENGTH)
    telegram_chat_id: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return _normalize_phone(v)


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
