"""Tests for BYOK AI key provider filtering.

Regression coverage for hiding the 5 unimplemented BYOK providers
(deepseek, groq, perplexity, mistral, xai) from the customer-facing
experience, while preserving them in SUPPORTED_PROVIDERS for future work.
"""
from fastapi.testclient import TestClient


def _register_and_login(client: TestClient, email: str) -> dict:
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpassword123"},
    )
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "testpassword123"},
    )
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_list_providers_only_returns_implemented(client: TestClient):
    """GET /providers must only surface claude, openai, gemini — not the 5 stubs."""
    headers = _register_and_login(client, "providers@example.com")

    response = client.get("/api/v1/ai-keys/providers", headers=headers)
    assert response.status_code == 200

    provider_ids = {p["id"] for p in response.json()}
    assert provider_ids == {"claude", "openai", "gemini"}
    for hidden in ("deepseek", "groq", "perplexity", "mistral", "xai"):
        assert hidden not in provider_ids


def test_add_ai_key_rejects_unimplemented_provider(client: TestClient):
    """POST / must reject a provider that isn't actually implemented, not just hide it."""
    headers = _register_and_login(client, "reject@example.com")

    response = client.post(
        "/api/v1/ai-keys/",
        json={"provider": "deepseek", "api_key": "sk-fake-key-1234567890"},
        headers=headers,
    )
    assert response.status_code == 400
    assert "deepseek" not in response.json()["detail"].split("Supported:")[-1]


def test_add_ai_key_accepts_implemented_provider(client: TestClient):
    """Sanity check: real providers are unaffected by the filter."""
    headers = _register_and_login(client, "accept@example.com")

    response = client.post(
        "/api/v1/ai-keys/",
        json={"provider": "gemini", "api_key": "test-fake-key-1234567890"},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["provider"] == "gemini"
