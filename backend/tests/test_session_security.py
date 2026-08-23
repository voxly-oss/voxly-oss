"""Tests for JWT session-revocation and password-reset-token security.

Regression guards for three findings in PRODUCTION_ACCEPTANCE_REPORT.md:

BUG-08: a JWT minted before a password change kept authenticating for its
full lifetime -- a stolen token survived the victim's own remediation.

BUG-09: a password-reset token was a stateless JWT with no invalidation, so
it could be redeemed repeatedly for its full 15-minute lifetime.

BUG-10: a reset token presented as a Bearer access token raised an uncaught
`ValueError: badly formed hexadecimal UUID string` (HTTP 500) instead of a
clean 401 -- token-type separation was accidental, not enforced.
"""
from fastapi.testclient import TestClient

from app.models.user import User
from app.utils.auth import create_reset_token


def _register_and_get_token(client: TestClient, email: str, credential: str = "Test1234") -> str:
    client.post("/api/v1/auth/register", json={
        "email": email,
        "password": credential,
        "full_name": "Test User",
        "agency_name": "Test Agency",
    })
    resp = client.post("/api/v1/auth/login", data={
        "username": email,
        "password": credential,
    })
    return resp.json()["access_token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── BUG-08: token revocation on password change ─────────────────────


def test_old_token_rejected_after_password_change(client: TestClient):
    old_token = _register_and_get_token(client, "sess1@test.com")

    # The pre-change token authenticates normally.
    assert client.get("/api/v1/auth/me", headers=_auth_headers(old_token)).status_code == 200

    change_resp = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "Test1234", "new_password": "NewPass5678"},
        headers=_auth_headers(old_token),
    )
    assert change_resp.status_code == 200

    # Same token, now stale: must be rejected, not still authenticate.
    resp = client.get("/api/v1/auth/me", headers=_auth_headers(old_token))
    assert resp.status_code == 401


def test_new_login_works_after_password_change(client: TestClient):
    old_token = _register_and_get_token(client, "sess2@test.com")
    client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "Test1234", "new_password": "NewPass5678"},
        headers=_auth_headers(old_token),
    )

    login_resp = client.post("/api/v1/auth/login", data={
        "username": "sess2@test.com", "password": "NewPass5678",
    })
    assert login_resp.status_code == 200
    new_token = login_resp.json()["access_token"]
    assert client.get("/api/v1/auth/me", headers=_auth_headers(new_token)).status_code == 200


def test_refresh_mints_a_token_that_still_works(client: TestClient):
    """The refreshed token must carry the *current* token_version, or a
    refresh immediately after login would mint a token that's already stale."""
    token = _register_and_get_token(client, "sess3@test.com")
    refresh_resp = client.post("/api/v1/auth/refresh", headers=_auth_headers(token))
    assert refresh_resp.status_code == 200
    refreshed = refresh_resp.json()["access_token"]
    assert client.get("/api/v1/auth/me", headers=_auth_headers(refreshed)).status_code == 200


# ── BUG-09: password-reset token is single-use ──────────────────────


def test_reset_token_is_rejected_on_replay(client: TestClient, db_session):
    _register_and_get_token(client, "sess4@test.com")
    user = db_session.query(User).filter(User.email == "sess4@test.com").first()
    token = create_reset_token(user.email, user.password_hash)

    first = client.post("/api/v1/auth/password-reset/confirm", json={
        "token": token, "new_password": "FirstReset99",
    })
    assert first.status_code == 200

    replay = client.post("/api/v1/auth/password-reset/confirm", json={
        "token": token, "new_password": "SecondReset99",
    })
    assert replay.status_code == 400

    # The first reset actually took effect; the replay did not overwrite it.
    login_resp = client.post("/api/v1/auth/login", data={
        "username": "sess4@test.com", "password": "FirstReset99",
    })
    assert login_resp.status_code == 200


def test_reset_token_invalidated_by_intervening_password_change(client: TestClient, db_session):
    """A token minted, then the password changed some other way (not via this
    token) before it's redeemed, must not still work."""
    old_token = _register_and_get_token(client, "sess5@test.com")
    user = db_session.query(User).filter(User.email == "sess5@test.com").first()
    reset_token = create_reset_token(user.email, user.password_hash)

    client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "Test1234", "new_password": "ChangedFirst9"},
        headers=_auth_headers(old_token),
    )

    resp = client.post("/api/v1/auth/password-reset/confirm", json={
        "token": reset_token, "new_password": "ViaOldReset9",
    })
    assert resp.status_code == 400


def test_reset_also_revokes_existing_sessions(client: TestClient, db_session):
    old_token = _register_and_get_token(client, "sess6@test.com")
    user = db_session.query(User).filter(User.email == "sess6@test.com").first()
    reset_token = create_reset_token(user.email, user.password_hash)

    client.post("/api/v1/auth/password-reset/confirm", json={
        "token": reset_token, "new_password": "PostReset999",
    })

    assert client.get("/api/v1/auth/me", headers=_auth_headers(old_token)).status_code == 401


# ── BUG-10: reset token as Bearer must 401 cleanly, never 500 ───────


def test_reset_token_as_bearer_returns_401_not_500(client: TestClient, db_session):
    _register_and_get_token(client, "sess7@test.com")
    user = db_session.query(User).filter(User.email == "sess7@test.com").first()
    reset_token = create_reset_token(user.email, user.password_hash)

    resp = client.get("/api/v1/auth/me", headers=_auth_headers(reset_token))
    assert resp.status_code == 401
