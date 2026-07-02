"""Tests for P1.7: BYOK key decoupling and refresh-token rotation."""
from fastapi.testclient import TestClient

from app.config import settings as app_settings
from app.api.v1 import ai_keys


# ── P1.7a: BYOK encryption key rotation (ENCRYPTION_KEY + SECRET_KEY fallback) ──

def test_encrypt_decrypt_roundtrip_with_secret_key(monkeypatch):
    monkeypatch.setattr(app_settings, "ENCRYPTION_KEY", "")
    token = ai_keys._encrypt_key("sk-ant-secret-value")
    assert token.startswith("v2:")
    assert ai_keys._decrypt_key(token) == "sk-ant-secret-value"


def test_key_encrypted_under_secret_still_decrypts_after_adding_encryption_key(monkeypatch):
    """Seamless rotation: a key stored before ENCRYPTION_KEY existed must still decrypt."""
    # 1. Encrypt while only SECRET_KEY is configured.
    monkeypatch.setattr(app_settings, "ENCRYPTION_KEY", "")
    legacy_token = ai_keys._encrypt_key("legacy-key")

    # 2. Operator later introduces a dedicated ENCRYPTION_KEY.
    monkeypatch.setattr(app_settings, "ENCRYPTION_KEY", "a-dedicated-encryption-secret-value")

    # New writes use the new key...
    new_token = ai_keys._encrypt_key("fresh-key")
    assert ai_keys._decrypt_key(new_token) == "fresh-key"
    # ...and the legacy SECRET_KEY-encrypted value still decrypts via fallback.
    assert ai_keys._decrypt_key(legacy_token) == "legacy-key"


# ── P1.7b: refresh-token rotation ──────────────────────────────────

def _register_login(client: TestClient, email: str, pw: str = "Test1234"):
    client.post("/api/v1/auth/register", json={
        "email": email, "password": pw, "full_name": "T", "agency_name": "A",
    })
    return client.post("/api/v1/auth/login", data={"username": email, "password": pw}).json()


def test_login_issues_refresh_token(client: TestClient):
    body = _register_login(client, "refresh@test.com")
    assert body["access_token"]
    assert body["refresh_token"]


def test_refresh_rotates_and_invalidates_old_token(client: TestClient):
    body = _register_login(client, "rotate@test.com")
    old_refresh = body["refresh_token"]

    # Exchange old refresh -> new access + new refresh
    r1 = client.post("/api/v1/auth/token/refresh", json={"refresh_token": old_refresh})
    assert r1.status_code == 200, r1.text
    new = r1.json()
    assert new["access_token"] and new["refresh_token"]
    assert new["refresh_token"] != old_refresh

    # The old refresh token is now single-use -> rejected.
    r2 = client.post("/api/v1/auth/token/refresh", json={"refresh_token": old_refresh})
    assert r2.status_code == 401

    # The new refresh token works.
    r3 = client.post("/api/v1/auth/token/refresh", json={"refresh_token": new["refresh_token"]})
    assert r3.status_code == 200


def test_logout_revokes_refresh_token(client: TestClient):
    body = _register_login(client, "logout@test.com")
    refresh = body["refresh_token"]

    assert client.post("/api/v1/auth/logout", json={"refresh_token": refresh}).status_code == 200
    # Revoked -> can no longer be exchanged.
    assert client.post("/api/v1/auth/token/refresh", json={"refresh_token": refresh}).status_code == 401


def test_invalid_refresh_token_rejected(client: TestClient):
    r = client.post("/api/v1/auth/token/refresh", json={"refresh_token": "not-a-real-token"})
    assert r.status_code == 401
