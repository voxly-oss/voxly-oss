import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Organization(Base):
    """Organization — the tenant and billing unit. Introduced in Phase 1 (Milestone 1: schema only, not yet load-bearing)."""

    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    owner_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    billing_region = Column(String(10), default="INTL", nullable=False)  # "IN" (Razorpay) or "INTL" (Stripe)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", foreign_keys=[owner_user_id])
    memberships = relationship("Membership", back_populates="organization", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Organization {self.slug}>"
