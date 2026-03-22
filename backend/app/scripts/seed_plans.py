"""
Seed default subscription plans into the database.

Run this script after migrations to populate the plans table:
    python -m app.scripts.seed_plans
"""
import asyncio
import uuid
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.plan import Plan


DEFAULT_PLANS = [
    {
        "name": "Free",
        "slug": "free",
        "tier_level": 0,
        "price_monthly": 0,
        "price_yearly": 0,
        "currency": "USD",
        "max_clients": 5,
        "max_projects": 3,
        "max_api_keys": 1,
        "rate_limit_per_minute": 10,
        "rate_limit_per_day": 100,
        "max_ai_messages_per_month": 50,
        "features": {
            "github_sync": True,
            "whatsapp_bot": True,
            "custom_branding": False,
            "priority_support": False,
            "api_access": True,
            "outbound_notifications": True,
        },
    },
    {
        "name": "Pro",
        "slug": "pro",
        "tier_level": 1,
        "price_monthly": 29,
        "price_yearly": 290,
        "currency": "USD",
        "max_clients": 50,
        "max_projects": 100,
        "max_api_keys": 5,
        "rate_limit_per_minute": 60,
        "rate_limit_per_day": 5000,
        "max_ai_messages_per_month": 1000,
        "features": {
            "github_sync": True,
            "whatsapp_bot": True,
            "custom_branding": True,
            "priority_support": True,
            "api_access": True,
            "outbound_notifications": True,
            "webhook_events": True,
            "analytics_dashboard": True,
        },
    },
    {
        "name": "Enterprise",
        "slug": "enterprise",
        "tier_level": 2,
        "price_monthly": 99,
        "price_yearly": 990,
        "currency": "USD",
        "max_clients": 500,
        "max_projects": 1000,
        "max_api_keys": 20,
        "rate_limit_per_minute": 300,
        "rate_limit_per_day": 50000,
        "max_ai_messages_per_month": 10000,
        "features": {
            "github_sync": True,
            "whatsapp_bot": True,
            "custom_branding": True,
            "priority_support": True,
            "api_access": True,
            "outbound_notifications": True,
            "webhook_events": True,
            "analytics_dashboard": True,
            "dedicated_support": True,
            "sla_guarantee": True,
            "custom_integrations": True,
            "multi_channel": True,
        },
    },
]


def seed_plans():
    """Seed plans into the database (idempotent — skips existing)."""
    db: Session = SessionLocal()
    
    try:
        for plan_data in DEFAULT_PLANS:
            existing = db.query(Plan).filter(Plan.slug == plan_data["slug"]).first()
            if existing:
                # Update existing plan with new values
                for key, value in plan_data.items():
                    setattr(existing, key, value)
                print(f"  ✓ Updated plan: {plan_data['name']}")
            else:
                plan = Plan(**plan_data)
                db.add(plan)
                print(f"  + Created plan: {plan_data['name']}")
        
        db.commit()
        print("\n✅ Plans seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error seeding plans: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_plans()
