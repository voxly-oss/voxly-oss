import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class Plan(Base):
    """Available subscription plans (Free, Pro, Enterprise)."""
    
    __tablename__ = "plans"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)  # "Free", "Pro", "Enterprise"
    slug = Column(String(50), nullable=False, unique=True)   # "free", "pro", "enterprise"
    tier_level = Column(Integer, nullable=False, default=0)   # 0=Free, 1=Pro, 2=Enterprise
    
    # Pricing
    price_monthly = Column(Float, default=0.0)
    price_yearly = Column(Float, default=0.0)
    currency = Column(String(3), default="USD")
    
    # Limits
    max_clients = Column(Integer, default=5)
    max_projects = Column(Integer, default=3)
    max_api_keys = Column(Integer, default=1)
    rate_limit_per_minute = Column(Integer, default=10)
    rate_limit_per_day = Column(Integer, default=100)
    max_ai_messages_per_month = Column(Integer, default=50)
    
    # Features
    features = Column(JSON, default=dict)  # {"github_sync": true, "custom_branding": false, ...}
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    subscriptions = relationship("Subscription", back_populates="plan")
    
    def __repr__(self):
        return f"<Plan {self.name}>"
