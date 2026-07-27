"""
Billing & Subscription Routes

Handles plans, subscriptions, checkout sessions, webhooks, and usage stats.
Supports dual gateways: Stripe (international) and Razorpay (India).
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import Annotated, Optional

from app.database import get_db
from app.models.user import User
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.schemas.subscription import (
    PlanResponse,
    PlanListResponse,
    SubscriptionResponse,
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    UsageStatsResponse,
)
from app.utils.auth import get_current_user
from app.utils.usage_tracker import get_usage_tracker
from app.utils.tenant_context import resolve_tenant_context
from app.config import get_settings
from app.rate_limit import limiter

import logging

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()


@router.get("/plans", response_model=PlanListResponse)
async def list_plans(*, db: Annotated[Session , Depends(get_db)],):
    """List all available subscription plans."""
    plans = db.query(Plan).filter(Plan.is_active == True).order_by(Plan.tier_level).all()
    return PlanListResponse(
        plans=[PlanResponse.model_validate(p) for p in plans]
    )


@router.get("/subscription", response_model=Optional[SubscriptionResponse])
@limiter.limit("20/minute")
async def get_subscription(*, 
    request: Request,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Get the current user's active subscription."""
    subscription = db.query(Subscription).filter(
        Subscription.user_id == current_user.id,
        Subscription.status.in_(["active", "trialing"])
    ).first()
    
    if not subscription:
        return None
    
    return SubscriptionResponse.model_validate(subscription)


@router.post(
    "/checkout",
    response_model=CheckoutSessionResponse,
    responses={
        400: {"description": "Invalid payment request"},
        404: {"description": "Plan not found"},
        500: {"description": "Failed to create checkout session"},
    },
)
@limiter.limit("5/minute")
async def create_checkout_session(*, 
    request: Request,
    payload: CheckoutSessionRequest,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Create a checkout session for Stripe or Razorpay.

    `request` is the starlette Request (slowapi's rate-limit wrapper resolves it
    by that exact name); the parsed body is `payload`. Reading `plan_id` off
    `request` raised AttributeError on every call, so this endpoint returned 500
    unconditionally and no upgrade could ever complete.
    """

    plan = db.query(Plan).filter(Plan.id == payload.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    if plan.slug == "free":
        raise HTTPException(status_code=400, detail="Cannot checkout for free plan")
    
    price = plan.price_monthly if payload.billing_cycle == "monthly" else plan.price_yearly
    
    if payload.payment_gateway == "stripe":
        return await _create_stripe_checkout(current_user, plan, price, payload)
    elif payload.payment_gateway == "razorpay":
        return await _create_razorpay_checkout(current_user, plan, price)
    else:
        raise HTTPException(status_code=400, detail="Invalid payment gateway")


async def _create_stripe_checkout(user, plan, price, payload):
    """Create a Stripe checkout session."""
    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        
        session = stripe.checkout.Session.create(
            customer_email=user.email,
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": plan.currency.lower(),
                    "product_data": {
                        "name": f"Voxly {plan.name} Plan",
                        "description": f"Up to {plan.max_clients} clients, {plan.max_projects} projects"
                    },
                    "unit_amount": int(price * 100),  # Stripe uses cents
                    "recurring": {
                        "interval": "month" if payload.billing_cycle == "monthly" else "year"
                    }
                },
                "quantity": 1
            }],
            mode="subscription",
            success_url=payload.success_url or f"{settings.FRONTEND_URL or 'http://localhost:3000'}/settings?tab=billing&status=success",
            cancel_url=payload.cancel_url or f"{settings.FRONTEND_URL or 'http://localhost:3000'}/settings?tab=billing&status=cancelled",
            metadata={
                "user_id": str(user.id),
                "plan_id": str(plan.id),
                "plan_slug": plan.slug
            }
        )
        
        return CheckoutSessionResponse(
            checkout_url=session.url,
            session_id=session.id,
            gateway="stripe"
        )
        
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


async def _create_razorpay_checkout(user, plan, price):
    """Create a Razorpay order."""
    try:
        import razorpay
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        
        # Razorpay uses paise (1 INR = 100 paise)
        amount_in_paise = int(price * 100)
        
        order = client.order.create({
            "amount": amount_in_paise,
            "currency": "INR",
            "notes": {
                "user_id": str(user.id),
                "plan_id": str(plan.id),
                "plan_slug": plan.slug,
                "user_email": user.email
            }
        })
        
        return CheckoutSessionResponse(
            checkout_url=f"razorpay://pay?order_id={order['id']}",
            session_id=order["id"],
            gateway="razorpay"
        )
        
    except Exception as e:
        logger.error(f"Razorpay order error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create payment order")


def _handle_stripe_checkout_completed(db: Session, session: dict) -> None:
    # Webhook payload metadata is always plain strings -- coerce to UUID
    # objects up front so every filter/insert below binds correctly (a raw
    # str against a UUID(as_uuid=True) column fails under SQLite; native
    # Postgres/psycopg2 is more forgiving, but this is correct either way).
    user_id = uuid.UUID(session["metadata"]["user_id"])
    plan_id = uuid.UUID(session["metadata"]["plan_id"])

    # Webhook handler -- no current_user/JWT here, so resolution goes through
    # the plain callable (Phase 1 Milestone 3), not the FastAPI dependency.
    # No-op (org_id=None) when the flag is off or the user can't be found.
    user = db.query(User).filter(User.id == user_id).first()
    tenant_org_id = resolve_tenant_context(db, user).org_id if user else None

    subscription = db.query(Subscription).filter(Subscription.user_id == user_id).first()

    if subscription:
        subscription.plan_id = plan_id
        subscription.status = "active"
        subscription.payment_gateway = "stripe"
        subscription.gateway_subscription_id = session.get("subscription")
        subscription.gateway_customer_id = session.get("customer")
        if tenant_org_id is not None and subscription.org_id is None:
            subscription.org_id = tenant_org_id
    else:
        subscription = Subscription(
            user_id=user_id,
            plan_id=plan_id,
            org_id=tenant_org_id,
            status="active",
            payment_gateway="stripe",
            gateway_subscription_id=session.get("subscription"),
            gateway_customer_id=session.get("customer"),
        )
        db.add(subscription)

    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if plan and user:
        user.subscription_tier = plan.slug

    db.commit()
    logger.info(f"Stripe subscription activated for user {user_id}")


def _handle_stripe_subscription_deleted(db: Session, sub_data: dict) -> None:
    subscription = db.query(Subscription).filter(
        Subscription.gateway_subscription_id == sub_data["id"]
    ).first()
    if not subscription:
        return

    subscription.status = "cancelled"
    user = db.query(User).filter(User.id == subscription.user_id).first()
    if user:
        user.subscription_tier = "free"
    db.commit()
    logger.info(f"Subscription cancelled for user {subscription.user_id}")


def _handle_razorpay_payment_captured(db: Session, payment: dict) -> None:
    notes = payment.get("notes", {})
    raw_user_id = notes.get("user_id")
    raw_plan_id = notes.get("plan_id")
    if not raw_user_id or not raw_plan_id:
        return
    # See _handle_stripe_checkout_completed for why these are coerced to UUID.
    user_id = uuid.UUID(raw_user_id)
    plan_id = uuid.UUID(raw_plan_id)

    # Webhook handler -- no current_user/JWT here, so resolution goes through
    # the plain callable (Phase 1 Milestone 3), not the FastAPI dependency.
    # No-op (org_id=None) when the flag is off or the user can't be found.
    user = db.query(User).filter(User.id == user_id).first()
    tenant_org_id = resolve_tenant_context(db, user).org_id if user else None

    subscription = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if subscription:
        subscription.plan_id = plan_id
        subscription.status = "active"
        subscription.payment_gateway = "razorpay"
        subscription.gateway_subscription_id = payment.get("id")
        if tenant_org_id is not None and subscription.org_id is None:
            subscription.org_id = tenant_org_id
    else:
        subscription = Subscription(
            user_id=user_id,
            plan_id=plan_id,
            org_id=tenant_org_id,
            status="active",
            payment_gateway="razorpay",
            gateway_subscription_id=payment.get("id"),
        )
        db.add(subscription)

    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if plan and user:
        user.subscription_tier = plan.slug

    db.commit()
    logger.info(f"Razorpay payment captured for user {user_id}")


@router.post(
    "/webhook/stripe",
    responses={400: {"description": "Invalid signature"}},
)
async def stripe_webhook(*, request: Request, db: Annotated[Session , Depends(get_db)],):
    """Handle Stripe webhook events (subscription created, updated, cancelled)."""
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        logger.error(f"Stripe webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    if event["type"] == "checkout.session.completed":
        _handle_stripe_checkout_completed(db, event["data"]["object"])
    elif event["type"] == "customer.subscription.deleted":
        _handle_stripe_subscription_deleted(db, event["data"]["object"])
    
    return {"status": "ok"}


@router.post(
    "/webhook/razorpay",
    responses={400: {"description": "Invalid signature"}},
)
async def razorpay_webhook(*, request: Request, db: Annotated[Session , Depends(get_db)],):
    """Handle Razorpay webhook events."""
    import razorpay
    
    payload = await request.json()
    sig_header = request.headers.get("x-razorpay-signature", "")
    
    try:
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        client.utility.verify_webhook_signature(
            await request.body(),
            sig_header,
            settings.RAZORPAY_WEBHOOK_SECRET
        )
    except Exception as e:
        logger.error(f"Razorpay webhook verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    event = payload.get("event")
    
    if event == "payment.captured":
        _handle_razorpay_payment_captured(db, payload["payload"]["payment"]["entity"])
    
    return {"status": "ok"}


@router.get("/usage", response_model=UsageStatsResponse)
@limiter.limit("20/minute")
async def get_usage_stats(*, 
    request: Request,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Get current usage statistics for the user."""
    from app.models.api_key import APIKey
    from app.models.client import Client
    from app.models.project import Project
    
    tracker = get_usage_tracker()
    
    # Get plan limits
    subscription = db.query(Subscription).filter(
        Subscription.user_id == current_user.id,
        Subscription.status == "active"
    ).first()
    
    if subscription and subscription.plan:
        plan = subscription.plan
    else:
        plan = db.query(Plan).filter(Plan.slug == "free").first()
    
    # Get actual counts
    clients_count = db.query(Client).filter(Client.user_id == current_user.id).count()
    projects_count = db.query(Project).join(Client).filter(Client.user_id == current_user.id).count()
    api_keys_count = db.query(APIKey).filter(
        APIKey.user_id == current_user.id,
        APIKey.is_active == True,
        APIKey.revoked_at.is_(None)
    ).count()
    
    # Get usage from Redis
    api_calls_today = await tracker.get_usage_today(str(current_user.id))
    api_calls_month = await tracker.get_usage_month(str(current_user.id))
    ai_messages = await tracker.get_ai_messages_month(str(current_user.id))
    
    # Calculate overall usage percentage
    if plan:
        usage_pct = max(
            clients_count / max(plan.max_clients, 1),
            projects_count / max(plan.max_projects, 1),
            api_calls_today / max(plan.rate_limit_per_day, 1)
        ) * 100
    else:
        usage_pct = 0
    
    return UsageStatsResponse(
        api_calls_today=api_calls_today,
        api_calls_limit_daily=plan.rate_limit_per_day if plan else 100,
        api_calls_this_month=api_calls_month,
        ai_messages_this_month=ai_messages,
        ai_messages_limit=plan.max_ai_messages_per_month if plan else 50,
        clients_count=clients_count,
        clients_limit=plan.max_clients if plan else 5,
        projects_count=projects_count,
        projects_limit=plan.max_projects if plan else 3,
        api_keys_count=api_keys_count,
        api_keys_limit=plan.max_api_keys if plan else 1,
        usage_percentage=round(usage_pct, 1)
    )


@router.post(
    "/portal",
    responses={
        400: {"description": "No Stripe subscription found. Use the dashboard to manage billing."},
        500: {"description": "Failed to create billing portal"},
    },
)
@limiter.limit("5/minute")
async def create_billing_portal(*, 
    request: Request,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Create a Stripe customer portal session for managing billing."""
    subscription = db.query(Subscription).filter(
        Subscription.user_id == current_user.id,
        Subscription.payment_gateway == "stripe"
    ).first()
    
    if not subscription or not subscription.gateway_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No Stripe subscription found. Use the dashboard to manage billing."
        )
    
    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        
        session = stripe.billing_portal.Session.create(
            customer=subscription.gateway_customer_id,
            return_url=f"{settings.FRONTEND_URL or 'http://localhost:3000'}/settings?tab=billing"
        )
        
        return {"portal_url": session.url}
    except Exception as e:
        logger.error(f"Stripe portal error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create billing portal")
