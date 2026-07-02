"""
API Key Authentication Middleware

Supports dual authentication:
1. JWT Bearer token (existing) — for frontend/dashboard
2. X-API-Key header — for programmatic API access

Both methods resolve to a User object.
"""
import secrets
import hashlib
import hmac
from datetime import datetime, timezone
from typing import Optional
from fastapi import Depends, HTTPException, Header, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.api_key import APIKey
from app.config import get_settings
from app.utils.auth import decode_access_token

settings = get_settings()


def _utcnow_for_compare(dt):
    """Return a 'now' datetime compatible with `dt` timezone awareness."""
    if dt is not None and dt.tzinfo is None:
        return datetime.now(timezone.utc).replace(tzinfo=None)
    return datetime.now(timezone.utc)


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate a new API key.
    
    Returns:
        Tuple of (full_key, key_prefix, key_hash)
    """
    # Generate 32 random bytes, encode as hex = 64 chars
    random_part = secrets.token_hex(32)
    full_key = f"{settings.API_KEY_PREFIX}{random_part}"
    
    # Prefix for lookup (first 16 chars of the full key including prefix)
    key_prefix = full_key[:16]

    # SHA-256 is the correct choice for high-entropy random tokens: it has no
    # 72-byte input limit (unlike bcrypt) and is fast for per-request lookups.
    # The key itself is 256 bits of entropy, so no slow KDF is needed.
    key_hash = _hash_api_key(full_key)

    return full_key, key_prefix, key_hash


def _hash_api_key(full_key: str) -> str:
    """Hash an API key with SHA-256 for storage/lookup."""
    return hashlib.sha256(full_key.encode("utf-8")).hexdigest()


def verify_api_key(plain_key: str, hashed_key: str) -> bool:
    """Verify an API key against its stored SHA-256 hash (constant-time)."""
    return hmac.compare_digest(_hash_api_key(plain_key), hashed_key)


async def get_api_key_record(x_api_key: str, db: Session) -> APIKey:
    """
    Authenticate an API key and return the matching APIKey record.

    Looks up by prefix, verifies the full hash, checks expiry, and updates
    ``last_used_at``. Raises 401 on any failure.
    """
    if not x_api_key.startswith(settings.API_KEY_PREFIX):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format"
        )

    # Use prefix for DB lookup (efficient)
    key_prefix = x_api_key[:16]

    candidate_keys = db.query(APIKey).filter(
        APIKey.key_prefix == key_prefix,
        APIKey.is_active == True,  # noqa: E712
        APIKey.revoked_at.is_(None)
    ).all()

    if not candidate_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key"
        )

    for api_key in candidate_keys:
        if verify_api_key(x_api_key, api_key.key_hash):
            if api_key.expires_at and api_key.expires_at < _utcnow_for_compare(api_key.expires_at):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="API key has expired"
                )
            api_key.last_used_at = datetime.now(timezone.utc)
            db.commit()
            return api_key

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key"
    )


async def get_user_from_api_key(x_api_key: str, db: Session) -> User:
    """Authenticate a user via API key (thin wrapper over get_api_key_record)."""
    api_key = await get_api_key_record(x_api_key, db)
    user = db.query(User).filter(User.id == api_key.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive"
        )
    return user


async def get_current_user_or_api_key(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db)
) -> User:
    """
    Dual authentication dependency (API key OR JWT Bearer).

    Stashes ``request.state.user_id`` / ``api_key_id`` / ``scopes`` so the
    usage-metering middleware and scope guards can read them.
    """
    # 1. API key auth
    if x_api_key:
        api_key = await get_api_key_record(x_api_key, db)
        user = db.query(User).filter(User.id == api_key.user_id).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is inactive"
            )
        request.state.user_id = str(user.id)
        request.state.api_key_id = str(api_key.id)
        request.state.scopes = list(api_key.scopes or [])
        return user

    # 2. JWT Bearer token (full access — a logged-in user has all scopes)
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        token_data = decode_access_token(token)
        if token_data is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid bearer token"
            )
        user = db.query(User).filter(User.id == token_data.user_id).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is inactive"
            )
        request.state.user_id = str(user.id)
        request.state.scopes = ["*"]  # JWT = full dashboard access
        return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing authentication. Provide either X-API-Key header or Authorization: Bearer <token>"
    )


def require_scope(scope: str):
    """
    Dependency factory enforcing an API-key scope (e.g. "clients:read").

    JWT sessions carry the "*" wildcard and always pass. API keys must have
    the exact scope (or "*") in their ``scopes`` list.
    """

    async def _guard(
        request: Request,
        user: User = Depends(get_current_user_or_api_key),
    ) -> User:
        scopes = getattr(request.state, "scopes", [])
        if "*" in scopes or scope in scopes:
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"API key missing required scope: {scope}",
        )

    return _guard
