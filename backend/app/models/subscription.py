import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Subscription(Base):
    """User subscription records linking users to plans."""
    
    __tablename__ = "subscriptions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=True, index=True)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False, index=True)
    
    # Status: active, cancelled, past_due, trialing, expired
    status = Column(String(50), default="active", nullable=False)
    
    # Payment gateway info
    payment_gateway = Column(String(20), nullable=True)  # "stripe" or "razorpay"
    gateway_subscription_id = Column(String(255), nullable=True, unique=True)
    gateway_customer_id = Column(String(255), nullable=True)
    
    # Billing period
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    cancel_at_period_end = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="subscription")
    plan = relationship("Plan", back_populates="subscriptions")
    
    def __repr__(self):
        return f"<Subscription {self.id} ({self.status})>"
