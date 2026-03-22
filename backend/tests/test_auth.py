"""Tests for authentication endpoints."""
import pytest
from fastapi.testclient import TestClient


def test_root_endpoint(client: TestClient):
    """Test root endpoint returns API info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Voxly API"
    assert data["version"] == "2.0.0"


def test_health_endpoint(client: TestClient):
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_register_user(client: TestClient):
    """Test user registration."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "password": "testpassword123",
            "full_name": "Test User",
            "agency_name": "Test Agency"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["full_name"] == "Test User"
    assert "id" in data
    assert "password_hash" not in data


def test_register_duplicate_email(client: TestClient):
    """Test that duplicate email registration fails."""
    user_data = {
        "email": "duplicate@example.com",
        "password": "testpassword123"
    }
    
    # First registration should succeed
    response = client.post("/api/v1/auth/register", json=user_data)
    assert response.status_code == 201
    
    # Second registration with same email should fail
    response = client.post("/api/v1/auth/register", json=user_data)
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


def test_login_success(client: TestClient):
    """Test successful login returns JWT token."""
    # First register a user
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "login@example.com",
            "password": "testpassword123"
        }
    )
    
    # Then login
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "login@example.com",
            "password": "testpassword123"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client: TestClient):
    """Test login with wrong password fails."""
    # First register a user
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "wrongpass@example.com",
            "password": "correctpassword"
        }
    )
    
    # Try login with wrong password
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "wrongpass@example.com",
            "password": "wrongpassword"
        }
    )
    assert response.status_code == 401


def test_get_me_authenticated(client: TestClient):
    """Test getting current user when authenticated."""
    # Register and login
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "me@example.com",
            "password": "testpassword123",
            "full_name": "Me User"
        }
    )
    
    login_response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "me@example.com",
            "password": "testpassword123"
        }
    )
    token = login_response.json()["access_token"]
    
    # Get current user
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "me@example.com"
    assert data["full_name"] == "Me User"


def test_get_me_unauthenticated(client: TestClient):
    """Test getting current user without authentication fails."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
