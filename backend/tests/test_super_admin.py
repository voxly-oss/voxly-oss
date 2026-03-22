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

