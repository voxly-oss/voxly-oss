"""Tests for the billing checkout flow (F1 regression).

The historical bug referenced `request.plan_id` on the FastAPI Request object,
so every checkout 500'd before reaching the gateway. These tests prove the plan
is now resolved from the request body and routed to the correct gateway handler.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.models.plan import Plan
from app.api.v1 import billing
from app.schemas.subscription import CheckoutSessionResponse


def _register_and_get_token(client: TestClient, email: str, credential: str = "Test1234") -> str:
    client.post("/api/v1/auth/register", json={
        "email": email, "password": credential,
        "full_name": "Test User", "agency_name": "Test Agency",
    })
    resp = client.post("/api/v1/auth/login", data={"username": email, "password": credential})
    return resp.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _seed_plan(db, slug: str, price: float) -> Plan:
    plan = Plan(
        id=uuid.uuid4(), name=slug.title(), slug=slug, tier_level=1,
        price_monthly=price, price_yearly=price * 10, currency="USD",
        max_clients=50, max_projects=100, max_api_keys=5,
        rate_limit_per_minute=60, rate_limit_per_day=5000,
        max_ai_messages_per_month=1000, features={}, is_active=True,
    )
    db.add(plan)
    db.commit()
    return plan


def test_checkout_resolves_plan_from_body(client: TestClient, db_session, monkeypatch):
    """A valid Pro checkout returns a session URL (proves F1 fix — no AttributeError)."""
    pro = _seed_plan(db_session, "pro", 29)
    token = _register_and_get_token(client, "buyer@test.com")

    async def _fake_stripe(user, plan, price, payload):
        assert str(plan.id) == str(pro.id)  # correct plan resolved from payload
        return CheckoutSessionResponse(
            checkout_url="https://checkout.stripe.test/session_123",
            session_id="session_123", gateway="stripe",
        )

    monkeypatch.setattr(billing, "_create_stripe_checkout", _fake_stripe)

    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(pro.id), "payment_gateway": "stripe", "billing_cycle": "monthly"},
        headers=_headers(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["checkout_url"].startswith("https://checkout.stripe.test/")


def test_checkout_rejects_free_plan(client: TestClient, db_session):
    """Cannot start a paid checkout for the free plan."""
    free = _seed_plan(db_session, "free", 0)
    token = _register_and_get_token(client, "freeloader@test.com")

    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(free.id), "payment_gateway": "stripe"},
        headers=_headers(token),
    )
    assert resp.status_code == 400, resp.text


def test_checkout_unknown_plan_404(client: TestClient):
    """Unknown plan id returns 404, not 500."""
    token = _register_and_get_token(client, "ghost@test.com")
    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(uuid.uuid4()), "payment_gateway": "stripe"},
        headers=_headers(token),
    )
    assert resp.status_code == 404, resp.text
