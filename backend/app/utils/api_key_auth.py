"""
API Key Authentication Middleware

Supports dual authentication:
1. JWT Bearer token (existing) — for frontend/dashboard
2. X-API-Key header — for programmatic API access

Both methods resolve to a User object.
"""
import secrets
import hashlib
from datetime import datetime, timezone
from typing import Optional
from fastapi import Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app.database import get_db
from app.models.user import User
from app.models.api_key import APIKey
from app.config import get_settings
from app.utils.auth import decode_access_token

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
    
    # Hash for secure storage
    key_hash = pwd_context.hash(full_key)
    
    return full_key, key_prefix, key_hash


def verify_api_key(plain_key: str, hashed_key: str) -> bool:
    """Verify an API key against its hash."""
    return pwd_context.verify(plain_key, hashed_key)


async def get_user_from_api_key(
    x_api_key: str,
    db: Session
) -> User:
    """
    Authenticate a user via API key.
    
    Looks up the key by prefix, then verifies the full hash.
    Updates last_used_at timestamp.
    """
    if not x_api_key.startswith(settings.API_KEY_PREFIX):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format"
        )
    
    # Use prefix for DB lookup (efficient)
    key_prefix = x_api_key[:16]
    
    # Find candidate keys by prefix
    candidate_keys = db.query(APIKey).filter(
        APIKey.key_prefix == key_prefix,
        APIKey.is_active == True,
        APIKey.revoked_at.is_(None)
    ).all()
    
    if not candidate_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key"
        )
    
    # Verify against each candidate (usually just 1)
    for api_key in candidate_keys:
        if verify_api_key(x_api_key, api_key.key_hash):
            # Check expiration
            if api_key.expires_at and api_key.expires_at < _utcnow_for_compare(api_key.expires_at):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="API key has expired"
                )
            
            # Update last used
            api_key.last_used_at = datetime.now(timezone.utc)
            db.commit()
            
            # Get the user
            user = db.query(User).filter(User.id == api_key.user_id).first()
            if not user or not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User account is inactive"
                )
            
            return user
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key"
    )


async def get_current_user_or_api_key(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db)
) -> User:
    """
    Dual authentication dependency.
    
    Checks for API key first, then falls back to JWT Bearer token.
    Use this as a dependency in routes that support both auth methods.
    """
    # 1. Try API key auth
    if x_api_key:
        return await get_user_from_api_key(x_api_key, db)
    
    # 2. Try JWT Bearer token
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
        return user
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing authentication. Provide either X-API-Key header or Authorization: Bearer <token>"
    )
