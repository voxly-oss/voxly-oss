"""Tests for GitHub webhook endpoint — HMAC signature validation."""
import json
import hmac
import hashlib
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


def _sign_payload(payload: dict, secret: str) -> str:
    """Generate a valid X-Hub-Signature-256 header value."""
    body = json.dumps(payload).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={signature}"


SAMPLE_PAYLOAD = {
    "action": "completed",
    "workflow_run": {
        "conclusion": "failure",
        "logs_url": "https://api.github.com/repos/test/test/actions/runs/123/logs",
        "head_commit": {"message": "fix: test commit"},
    },
    "repository": {"full_name": "test/test-repo"},
}


def _make_settings(secret: str, debug: bool = False) -> MagicMock:
    """Create a properly typed settings mock — avoids MagicMock truthy DEBUG bug."""
    m = MagicMock()
    m.GITHUB_WEBHOOK_SECRET = secret
    m.DEBUG = debug  # explicit bool, not a truthy MagicMock
    return m


def test_webhook_no_signature_rejected(client: TestClient):
    """Webhook without signature header should be rejected when secret is set."""
    with patch("app.api.v1.github.settings", _make_settings("test-secret-123")):
        resp = client.post(
            "/api/v1/github/webhook",
            json=SAMPLE_PAYLOAD,
            headers={"X-GitHub-Event": "workflow_run"},
        )
        assert resp.status_code == 401


def test_webhook_invalid_signature_rejected(client: TestClient):
    """Webhook with wrong signature should be rejected."""
    with patch("app.api.v1.github.settings", _make_settings("correct-secret")):
        resp = client.post(
            "/api/v1/github/webhook",
            json=SAMPLE_PAYLOAD,
            headers={
                "X-GitHub-Event": "workflow_run",
                "X-Hub-Signature-256": "sha256=invalid_signature_here",
            },
        )
        assert resp.status_code == 401


def test_webhook_valid_signature_accepted(client: TestClient):
    """Webhook with correct HMAC signature should be accepted."""
    secret = "my-valid-secret"
    body = json.dumps(SAMPLE_PAYLOAD).encode()
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    with patch("app.api.v1.github.settings", _make_settings(secret)):
        resp = client.post(
            "/api/v1/github/webhook",
            content=body,
            headers={
                "X-GitHub-Event": "ping",
                "X-Hub-Signature-256": signature,
                "Content-Type": "application/json",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "received"


def test_webhook_no_secret_non_debug_rejects(client: TestClient):
    """When no webhook secret is configured in production (DEBUG=False), reject all requests."""
    with patch("app.api.v1.github.settings", _make_settings("", debug=False)):
        resp = client.post(
            "/api/v1/github/webhook",
            json=SAMPLE_PAYLOAD,
            headers={"X-GitHub-Event": "ping"},
        )
        assert resp.status_code == 401


def test_webhook_no_secret_debug_allows(client: TestClient):
    """When no webhook secret is configured in DEBUG mode, requests pass through."""
    with patch("app.api.v1.github.settings", _make_settings("", debug=True)):
        resp = client.post(
            "/api/v1/github/webhook",
            json=SAMPLE_PAYLOAD,
            headers={"X-GitHub-Event": "ping"},
        )
        assert resp.status_code == 200
