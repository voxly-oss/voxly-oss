"""Tests for the admin AI chat endpoint (POST /api/v1/ai/chat).

Regression coverage for a route-wiring defect: the Starlette Request
parameter was named `raw_request` while the Pydantic request body was named
`request`, which shadowed what slowapi's @limiter.limit() decorator expects
to find — every call 500'd with "parameter `request` must be an instance of
starlette.requests.Request". This endpoint previously had zero test coverage
of any kind, which is exactly why a route-level bug like this went unnoticed;
mocked agent-level tests (test_ai_integration.py) never exercise the actual
FastAPI route + rate-limiter decorator stack, so this test drives a real
HTTP call through TestClient instead.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.rate_limit import limiter


def _register_and_login(client: TestClient, email: str) -> dict:
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpassword123", "agency_name": "Test Agency"},
    )
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "testpassword123"},
    )
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_admin_chat_returns_200_not_500(client: TestClient):
    """A real HTTP call to /api/v1/ai/chat must succeed, not 500 on the rate limiter.

    conftest.py's autouse _disable_rate_limits fixture sets limiter.enabled =
    False for every test — but slowapi skips its own request-parameter
    inspection entirely when disabled, which is exactly the code path this
    bug was in. Re-enabling it here is required for this test to mean
    anything; without it, this test passes identically against the broken
    and fixed code (verified via git stash).
    """
    headers = _register_and_login(client, "owner@example.com")
    limiter.enabled = True

    # Patched where it's looked up (ai.py does a module-level `from ... import
    # VoxlyAgent`), not at its source module — the source-module patch used
    # by test_ai_integration.py only works there because that caller imports
    # VoxlyAgent lazily, inside the function, at call time.
    with patch("app.api.v1.ai.VoxlyAgent") as MockAgentClass:
        mock_agent = MockAgentClass.return_value
        mock_agent.chat = AsyncMock(return_value={
            "response": "Here's the project status you asked about.",
            "tools_used": [],
        })

        response = client.post(
            "/api/v1/ai/chat",
            json={"message": "What's the status of my projects?"},
            headers=headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["response"] == "Here's the project status you asked about."
    mock_agent.chat.assert_called_once()
    assert mock_agent.chat.call_args.kwargs["user_message"] == "What's the status of my projects?"


def test_admin_chat_requires_auth(client: TestClient):
    """Unauthenticated calls must be rejected, not reach the agent."""
    response = client.post("/api/v1/ai/chat", json={"message": "hello"})
    assert response.status_code == 401
