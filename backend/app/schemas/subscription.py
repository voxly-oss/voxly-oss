from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID


# --- Plan Schemas ---

class PlanResponse(BaseModel):
    """Schema for plan details."""
    id: UUID
    name: str
    slug: str
    tier_level: int
    price_monthly: float
    price_yearly: float
    currency: str
    max_clients: int
    max_projects: int
    max_api_keys: int
    rate_limit_per_minute: int
    rate_limit_per_day: int
    max_ai_messages_per_month: int
    features: Dict[str, Any] = {}

    model_config = ConfigDict(from_attributes=True)


class PlanListResponse(BaseModel):
    """Schema for listing plans."""
    plans: List[PlanResponse]


# --- Subscription Schemas ---

class SubscriptionResponse(BaseModel):
    """Schema for current subscription status."""
    id: UUID
    plan: PlanResponse
    status: str
    payment_gateway: Optional[str] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CheckoutSessionRequest(BaseModel):
    """Schema for creating a checkout session."""
    plan_id: UUID
    payment_gateway: str = Field(..., pattern="^(stripe|razorpay)$", description="Payment gateway to use")
    billing_cycle: str = Field(default="monthly", pattern="^(monthly|yearly)$")
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CheckoutSessionResponse(BaseModel):
    """Schema for checkout session response."""
    checkout_url: str
    session_id: str
    gateway: str


# --- Usage Schemas ---

class UsageStatsResponse(BaseModel):
    """Schema for current usage statistics."""
    api_calls_today: int = 0
    api_calls_limit_daily: int = 100
    api_calls_this_month: int = 0
    ai_messages_this_month: int = 0
    ai_messages_limit: int = 50
    clients_count: int = 0
    clients_limit: int = 5
    projects_count: int = 0
    projects_limit: int = 3
    api_keys_count: int = 0
    api_keys_limit: int = 1
    usage_percentage: float = 0.0  # Overall usage as percentage
