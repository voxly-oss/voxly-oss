import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
STRING_255 = 255


class User(Base):
    """User model for agency owners/admins."""
    
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(STRING_255), unique=True, nullable=False, index=True)
    password_hash = Column(String(STRING_255), nullable=True)  # Nullable for Google-only users
    google_id = Column(String(STRING_255), unique=True, nullable=True, index=True)
    github_id = Column(String(STRING_255), unique=True, nullable=True, index=True)

    full_name = Column(String(STRING_255), nullable=True)
    agency_name = Column(String(STRING_255), nullable=True)
    phone = Column(String(50), nullable=True)
    subscription_tier = Column(String(50), default="free")  # Legacy field, use subscription relationship
    billing_region = Column(String(10), default="INTL")  # "IN" for India (Razorpay), "INTL" for international (Stripe)
    is_active = Column(Boolean, default=True)
    # Bumped on password change; embedded in every JWT at mint time and
    # compared on every request in get_current_user. A stolen token can't
    # survive the victim resetting their password once this no longer matches.
    token_version = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    clients = relationship("Client", back_populates="user", cascade="all, delete-orphan")
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="user", uselist=False, cascade="all, delete-orphan")
    usage_logs = relationship("UsageLog", back_populates="user", cascade="all, delete-orphan")
    ai_keys = relationship("UserAIKey", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User {self.email}>"

