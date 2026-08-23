"""Tests for POST /api/v1/notifications/send.

The regression these exist for: slowapi's ``@limiter.limit`` wrapper resolves a
handler parameter *by the name* ``request`` and raises if it is not a
``starlette.requests.Request``. ``send_follow_up`` originally bound the Pydantic
body to ``request`` and the ASGI request to ``raw_request``, so every call
raised and returned 500 — but only when the limiter was enabled. conftest's
autouse ``_disable_rate_limits`` fixture turns the limiter off for the whole
suite, so nothing caught it. ``test_send_follow_up_works_with_limiter_enabled``
below re-enables it deliberately; do not remove that.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.rate_limit import limiter


@pytest.fixture
def captured_whatsapp(monkeypatch):
    """Capture outbound sends instead of hitting the real Twilio account."""
    sent: list[tuple[str, str]] = []

    async def _capture(to_number: str, message: str) -> bool:
        sent.append((to_number, message))
        return True

    monkeypatch.setattr("app.services.whatsapp_service.send_whatsapp_message", _capture)
    monkeypatch.setattr("app.services.notification_service.send_whatsapp_message", _capture)
    return sent


@pytest.fixture
def limiter_enabled():
    """Re-enable the limiter that conftest disables suite-wide."""
    original = limiter.enabled
    limiter.enabled = True
    limiter.reset()
    yield
    limiter.enabled = original
    limiter.reset()


def _auth(client: TestClient) -> dict:
    email = f"notify-{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post("/api/v1/auth/register", json={
        "email": email, "password": "Test1234", "full_name": "N", "agency_name": "N",
    })
    assert resp.status_code == 201, resp.text
    token = client.post(
        "/api/v1/auth/login", data={"username": email, "password": "Test1234"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_client(client: TestClient, headers: dict, phone: str, sent: list | None = None) -> str:
    resp = client.post("/api/v1/clients", json={"name": "Acme Co", "phone": phone}, headers=headers)
    assert resp.status_code == 201, resp.text
    # Client creation fires its own "welcome" WhatsApp notification. Drop it so
    # assertions below describe only what the endpoint under test sent.
    if sent is not None:
        sent.clear()
    return resp.json()["id"]


def test_send_follow_up_works_with_limiter_enabled(client, captured_whatsapp, limiter_enabled):
    """The actual regression: with the limiter live, the handler must not 500."""
    headers = _auth(client)
    client_id = _make_client(client, headers, "+919400000001", captured_whatsapp)

    resp = client.post(
        "/api/v1/notifications/send",
        json={"client_id": client_id, "message": "Quick update on your project"},
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"success": True, "client_name": "Acme Co", "message": "Quick update on your project"}
    assert captured_whatsapp == [("+919400000001", "Quick update on your project")]


def test_send_follow_up_returns_client_name_for_the_success_toast(client, captured_whatsapp):
    headers = _auth(client)
    client_id = _make_client(client, headers, "+919400000002")

    resp = client.post(
        "/api/v1/notifications/send",
        json={"client_id": client_id, "message": "hello"},
        headers=headers,
    )

    assert resp.status_code == 200
    assert resp.json()["client_name"] == "Acme Co"


@pytest.mark.parametrize(
    "message,expected",
    [("", 422), ("x", 200), ("x" * 1000, 200), ("x" * 1001, 422)],
)
def test_message_length_bounds(client, captured_whatsapp, message, expected):
    """The dialog enforces 1..1000 client-side; this pins the server contract
    those limits are copied from."""
    headers = _auth(client)
    client_id = _make_client(client, headers, f"+9194000{uuid.uuid4().int % 100000:05d}")

    resp = client.post(
        "/api/v1/notifications/send",
        json={"client_id": client_id, "message": message},
        headers=headers,
    )
    assert resp.status_code == expected, resp.text


def test_unknown_client_returns_404(client, captured_whatsapp):
    headers = _auth(client)
    resp = client.post(
        "/api/v1/notifications/send",
        json={"client_id": str(uuid.uuid4()), "message": "hi"},
        headers=headers,
    )
    assert resp.status_code == 404
    assert isinstance(resp.json()["detail"], str)
    assert captured_whatsapp == []


def test_cannot_send_to_another_tenants_client(client, captured_whatsapp):
    owner_headers = _auth(client)
    client_id = _make_client(client, owner_headers, "+919400000003", captured_whatsapp)

    other_headers = _auth(client)
    resp = client.post(
        "/api/v1/notifications/send",
        json={"client_id": client_id, "message": "hi"},
        headers=other_headers,
    )

    assert resp.status_code == 404
    assert captured_whatsapp == []


def test_requires_authentication(client, captured_whatsapp):
    resp = client.post(
        "/api/v1/notifications/send",
        json={"client_id": str(uuid.uuid4()), "message": "hi"},
    )
    assert resp.status_code == 401
    assert captured_whatsapp == []


def test_rate_limited_at_ten_per_minute(client, captured_whatsapp, limiter_enabled):
    headers = _auth(client)
    client_id = _make_client(client, headers, "+919400000004")

    codes = [
        client.post(
            "/api/v1/notifications/send",
            json={"client_id": client_id, "message": "spam"},
            headers=headers,
        ).status_code
        for _ in range(14)
    ]

    assert 200 in codes
    assert 429 in codes, f"expected the 10/minute limit to fire, got {sorted(set(codes))}"
