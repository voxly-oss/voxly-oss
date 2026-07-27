"""Tests for the billing router.

This file exists because it didn't. ``POST /api/v1/billing/checkout`` read
``plan_id`` off the starlette ``Request`` instead of the parsed body, so it
raised ``AttributeError`` and returned 500 on every call — Stripe and Razorpay
alike — and no user could ever complete an upgrade. Billing was the only major
router with no automated coverage at all, which is exactly why a one-token
defect on the revenue path survived to production.

``test_checkout_unknown_plan_returns_404`` is the tightest regression guard:
before the fix it never reached the plan lookup, so it 500'd instead of 404ing.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.models.plan import Plan
from app.models.subscription import Subscription
from app.rate_limit import limiter


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def plans(db_session):
    """A free plan and a paid plan, matching the seed script's shape.

    The slugs must be exactly "free"/"pro": the checkout handler special-cases
    ``plan.slug == "free"`` to reject an upgrade to the free tier. Tables are
    recreated per test, so fixed slugs cannot collide across tests.
    """
    free = Plan(
        name="Free", slug="free", tier_level=0,
        price_monthly=0, price_yearly=0, currency="USD",
        max_clients=5, max_projects=3, max_api_keys=1, max_ai_messages_per_month=50,
    )
    pro = Plan(
        name="Pro", slug="pro", tier_level=2,
        price_monthly=29, price_yearly=290, currency="USD",
        max_clients=50, max_projects=100, max_api_keys=10, max_ai_messages_per_month=5000,
    )
    db_session.add_all([free, pro])
    db_session.commit()
    db_session.refresh(free)
    db_session.refresh(pro)
    return {"free": free, "pro": pro}


@pytest.fixture
def stripe_stub(monkeypatch):
    """Stand in for Stripe's network call so checkout can be exercised offline."""
    import stripe

    created: list[dict] = []

    class _Session:
        url = "https://checkout.stripe.test/session/cs_test_123"
        id = "cs_test_123"

    def _create(**kwargs):
        created.append(kwargs)
        return _Session()

    monkeypatch.setattr(stripe.checkout.Session, "create", staticmethod(_create))
    return created


@pytest.fixture
def razorpay_stub(monkeypatch):
    """Stand in for Razorpay's network call."""
    import razorpay

    created: list[dict] = []

    class _Order:
        @staticmethod
        def create(payload):
            created.append(payload)
            return {"id": "order_test_123"}

    class _Client:
        def __init__(self, *args, **kwargs):
            self.order = _Order()

    monkeypatch.setattr(razorpay, "Client", _Client)
    return created


@pytest.fixture
def limiter_enabled():
    """conftest disables the limiter suite-wide; re-enable it deliberately."""
    original = limiter.enabled
    limiter.enabled = True
    limiter.reset()
    yield
    limiter.enabled = original
    limiter.reset()


def _auth(client: TestClient) -> dict:
    email = f"billing-{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post("/api/v1/auth/register", json={
        "email": email, "password": "Test1234", "full_name": "B", "agency_name": "B",
    })
    assert resp.status_code == 201, resp.text
    token = client.post(
        "/api/v1/auth/login", data={"username": email, "password": "Test1234"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Plans / subscription / usage ────────────────────────────────────────────


def test_plans_are_public(client, plans):
    resp = client.get("/api/v1/billing/plans")
    assert resp.status_code == 200
    slugs = {p["slug"] for p in resp.json()["plans"]}
    assert plans["pro"].slug in slugs


def test_subscription_is_null_when_none_exists(client, plans):
    headers = _auth(client)
    resp = client.get("/api/v1/billing/subscription", headers=headers)
    assert resp.status_code == 200
    assert resp.json() is None


def test_usage_reports_real_counts(client, plans):
    headers = _auth(client)
    client_id = client.post(
        "/api/v1/clients", json={"name": "Acme", "phone": "+919600000001"}, headers=headers
    ).json()["id"]
    client.post("/api/v1/projects", json={"client_id": client_id, "name": "site"}, headers=headers)

    resp = client.get("/api/v1/billing/usage", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["clients_count"] == 1
    assert body["projects_count"] == 1


def test_usage_requires_authentication(client):
    assert client.get("/api/v1/billing/usage").status_code == 401


# ── Checkout — the regression this file was written for ─────────────────────


def test_checkout_stripe_returns_a_checkout_url(client, plans, stripe_stub):
    headers = _auth(client)
    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(plans["pro"].id), "payment_gateway": "stripe", "billing_cycle": "monthly"},
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["gateway"] == "stripe"
    assert body["checkout_url"].startswith("https://checkout.stripe.test/")
    # The selected plan must actually reach Stripe — proving the handler read
    # plan_id from the body and not from the ASGI request.
    assert len(stripe_stub) == 1
    assert stripe_stub[0]["metadata"]["plan_id"] == str(plans["pro"].id)
    assert stripe_stub[0]["line_items"][0]["price_data"]["unit_amount"] == 2900


def test_checkout_stripe_yearly_uses_the_yearly_price(client, plans, stripe_stub):
    headers = _auth(client)
    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(plans["pro"].id), "payment_gateway": "stripe", "billing_cycle": "yearly"},
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    assert stripe_stub[0]["line_items"][0]["price_data"]["unit_amount"] == 29000
    assert stripe_stub[0]["line_items"][0]["price_data"]["recurring"]["interval"] == "year"


def test_checkout_razorpay_returns_an_order(client, plans, razorpay_stub):
    headers = _auth(client)
    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(plans["pro"].id), "payment_gateway": "razorpay"},
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["gateway"] == "razorpay"
    assert len(razorpay_stub) == 1
    assert razorpay_stub[0]["notes"]["plan_id"] == str(plans["pro"].id)


def test_checkout_unknown_plan_returns_404(client, plans):
    """The tightest guard: before the fix this never reached the plan lookup."""
    headers = _auth(client)
    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(uuid.uuid4()), "payment_gateway": "stripe"},
        headers=headers,
    )
    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == "Plan not found"


def test_checkout_rejects_the_free_plan(client, plans):
    headers = _auth(client)
    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(plans["free"].id), "payment_gateway": "stripe"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_checkout_rejects_an_unknown_gateway(client, plans):
    headers = _auth(client)
    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(plans["pro"].id), "payment_gateway": "bitcoin"},
        headers=headers,
    )
    assert resp.status_code == 422, resp.text


def test_checkout_requires_authentication(client, plans):
    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(plans["pro"].id), "payment_gateway": "stripe"},
    )
    assert resp.status_code == 401


def test_checkout_works_with_the_limiter_enabled(client, plans, stripe_stub, limiter_enabled):
    """slowapi resolves a parameter named `request` and raises if it is not a
    starlette Request. Keep this exercising the decorated path."""
    headers = _auth(client)
    resp = client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": str(plans["pro"].id), "payment_gateway": "stripe"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text


# ── Portal & webhooks ───────────────────────────────────────────────────────


def test_portal_without_a_stripe_subscription_returns_400(client, plans):
    headers = _auth(client)
    resp = client.post("/api/v1/billing/portal", headers=headers)
    assert resp.status_code == 400
    assert "Stripe" in resp.json()["detail"]


def test_portal_requires_authentication(client):
    assert client.post("/api/v1/billing/portal").status_code == 401


def test_stripe_webhook_rejects_an_unsigned_payload(client):
    resp = client.post("/api/v1/billing/webhook/stripe", json={"type": "checkout.session.completed"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid signature"


def test_razorpay_webhook_rejects_an_unsigned_payload(client):
    resp = client.post("/api/v1/billing/webhook/razorpay", json={"event": "payment.captured"})
    assert resp.status_code == 400


def test_stripe_checkout_completed_activates_the_subscription(client, db_session, plans, monkeypatch):
    """The webhook handler itself, bypassing signature verification — that path
    is covered separately above."""
    import stripe
    from app.api.v1.billing import _handle_stripe_checkout_completed

    headers = _auth(client)
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["id"]

    _handle_stripe_checkout_completed(db_session, {
        "metadata": {"user_id": user_id, "plan_id": str(plans["pro"].id)},
        "subscription": "sub_test_1",
        "customer": "cus_test_1",
    })

    sub = db_session.query(Subscription).filter(Subscription.user_id == uuid.UUID(user_id)).one()
    assert sub.status == "active"
    assert sub.payment_gateway == "stripe"
    assert sub.gateway_customer_id == "cus_test_1"

    resp = client.get("/api/v1/billing/subscription", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"
    assert stripe is not None  # import kept meaningful for the reader
