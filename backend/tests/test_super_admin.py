"""Tests for super admin endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.config import settings


def test_super_admin_requires_auth(client: TestClient):
    """Test that super admin endpoints require authentication."""
    response = client.get("/voxly-admin/tenants")
    assert response.status_code == 401


def test_super_admin_requires_super_admin_email(client: TestClient):
    """Test that normal users cannot access super admin endpoints."""
    # Override settings for testing
    settings.SUPER_ADMIN_EMAIL = "admin@voxly.app"
    settings.SUPER_ADMIN_SECRET = "super_secret_123"
    
    # Register and login a normal user
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "normal@example.com",
            "password": "testpassword123",
        }
    )
    login_response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "normal@example.com",
            "password": "testpassword123",
        }
    )
    token = login_response.json()["access_token"]
    
    # Attempt to access super admin endpoint
    response = client.get(
        "/voxly-admin/tenants",
        headers={"Authorization": f"Bearer {token}"}
    )
    # Should be forbidden because email != SUPER_ADMIN_EMAIL
    assert response.status_code == 403


def test_super_admin_requires_secret_header(client: TestClient):
    """Test that super admin endpoints require the X-Admin-Secret header."""
    # Override settings for testing
    settings.SUPER_ADMIN_EMAIL = "admin@voxly.app"
    settings.SUPER_ADMIN_SECRET = "super_secret_123"
    
    # Register and login the admin user
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin@voxly.app",
            "password": "testpassword123",
        }
    )
    login_response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "admin@voxly.app",
            "password": "testpassword123",
        }
    )
    token = login_response.json()["access_token"]
    
    # Attempt to access WITHOUT the secret header
    response = client.get(
        "/voxly-admin/tenants",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
    
    # Attempt to access WITH the WRONG secret header
    response = client.get(
        "/voxly-admin/tenants",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Admin-Secret": "wrong_secret"
        }
    )
    assert response.status_code == 403
    
    # Attempt to access WITH the RIGHT secret header
    response = client.get(
        "/voxly-admin/tenants",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Admin-Secret": "super_secret_123"
        }
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_override_user_plan_updates_effective_usage_limits(client: TestClient, db_session):
    """
    Overriding a user's plan must change what GET /billing/usage reports for
    that user, not just the legacy subscription_tier display string.

    Regression test: get_usage_stats() (billing.py) resolves plan limits via
    the Subscription table only; the override endpoint used to update
    subscription_tier alone, leaving a tenant's actual usage limits silently
    stuck on the Free plan no matter what tier a super admin set.
    """
    from app.models.plan import Plan

    settings.SUPER_ADMIN_EMAIL = "admin@voxly.app"
    settings.SUPER_ADMIN_SECRET = "super_secret_123"

    # seed_plans.py isn't run against the test DB — seed the two plans we need directly.
    db_session.add(Plan(name="Free", slug="free", max_clients=5, max_projects=3, max_ai_messages_per_month=50))
    db_session.add(Plan(name="Pro", slug="pro", max_clients=50, max_projects=100, max_ai_messages_per_month=1000))
    db_session.commit()

    client.post("/api/v1/auth/register", json={"email": "admin@voxly.app", "password": "testpassword123"})
    admin_token = client.post(
        "/api/v1/auth/login",
        data={"username": "admin@voxly.app", "password": "testpassword123"},
    ).json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}", "X-Admin-Secret": "super_secret_123"}

    register_response = client.post(
        "/api/v1/auth/register",
        json={"email": "customer@example.com", "password": "testpassword123"},
    )
    customer_id = register_response.json()["id"]
    customer_token = client.post(
        "/api/v1/auth/login",
        data={"username": "customer@example.com", "password": "testpassword123"},
    ).json()["access_token"]
    customer_headers = {"Authorization": f"Bearer {customer_token}"}

    # Before override: a fresh registration has no Subscription row, falls back to Free.
    before = client.get("/api/v1/billing/usage", headers=customer_headers)
    assert before.status_code == 200
    assert before.json()["clients_limit"] == 5

    override_response = client.patch(
        f"/voxly-admin/users/{customer_id}/plan",
        json={"subscription_tier": "pro"},
        headers=admin_headers,
    )
    assert override_response.status_code == 200

    # After override: the customer's own usage endpoint must reflect Pro limits immediately.
    after = client.get("/api/v1/billing/usage", headers=customer_headers)
    assert after.status_code == 200
    assert after.json()["clients_limit"] == 50
    assert after.json()["ai_messages_limit"] == 1000


def test_override_user_plan_rejects_unknown_tier(client: TestClient, db_session):
    """An override to a plan slug that doesn't exist must fail cleanly, not corrupt state."""
    from app.models.plan import Plan

    settings.SUPER_ADMIN_EMAIL = "admin@voxly.app"
    settings.SUPER_ADMIN_SECRET = "super_secret_123"

    db_session.add(Plan(name="Free", slug="free", max_clients=5, max_projects=3, max_ai_messages_per_month=50))
    db_session.commit()

    client.post("/api/v1/auth/register", json={"email": "admin@voxly.app", "password": "testpassword123"})
    admin_token = client.post(
        "/api/v1/auth/login",
        data={"username": "admin@voxly.app", "password": "testpassword123"},
    ).json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}", "X-Admin-Secret": "super_secret_123"}

    register_response = client.post(
        "/api/v1/auth/register",
        json={"email": "typo-customer@example.com", "password": "testpassword123"},
    )
    customer_id = register_response.json()["id"]

    response = client.patch(
        f"/voxly-admin/users/{customer_id}/plan",
        json={"subscription_tier": "pr0"},
        headers=admin_headers,
    )
    assert response.status_code == 400

