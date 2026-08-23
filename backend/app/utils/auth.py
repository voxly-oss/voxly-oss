from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
import hashlib

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt.exceptions import InvalidTokenError
import bcrypt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.user import TokenData

# OAuth2 scheme for token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash using native bcrypt."""
    try:
        return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    """Hash a password using native bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode(), salt).decode()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token using PyJWT (replaces python-jose CVE-2024-33664/33663)."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({
        "exp": expire,
        "iss": "voxly_api",
        "aud": "voxly_frontend",
    })
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[TokenData]:
    """Decode and validate a JWT access token.

    A password-reset token (create_reset_token) shares this signing key and
    the same iss/aud, so it passes structural validation here too -- the only
    thing that has ever stopped it is that its `sub` is an email, not a UUID,
    which made `UUID(user_id)` raise an uncaught ValueError (500) instead of a
    clean 401. Reject anything carrying a reset `scope` claim outright, and
    treat a malformed `sub` as "not a valid access token" rather than crashing.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            issuer="voxly_api",
            audience="voxly_frontend",
        )
        if payload.get("scope") is not None:
            # Only special-purpose tokens (e.g. password_reset) carry a scope
            # claim; a real access token never does.
            return None

        user_id: str = payload.get("sub")
        email: str = payload.get("email")

        if user_id is None:
            return None

        # Missing "tv" means a token minted before this claim existed --
        # treat that as version 0, matching every user's starting value, so
        # this rollout doesn't force-log-out already-issued sessions.
        return TokenData(user_id=UUID(user_id), email=email, token_version=payload.get("tv", 0))
    except (InvalidTokenError, ValueError):
        return None


def _password_fingerprint(password_hash: str) -> str:
    """One-way fingerprint of a password hash, bound into reset tokens so
    they stop working the instant the hash changes -- either because the
    token was just redeemed, or the password changed some other way in the
    meantime. Never embed the raw bcrypt hash in a JWT claim (client-visible);
    this fingerprint doesn't allow recovering it."""
    return hashlib.sha256(f"{password_hash}{settings.SECRET_KEY}".encode()).hexdigest()[:32]


def create_reset_token(email: str, password_hash: str) -> str:
    """Create a 15-minute, single-use password reset token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode = {
        "exp": expire,
        "sub": email,
        "scope": "password_reset",
        "pwfp": _password_fingerprint(password_hash),
        "iss": "voxly_api",
        "aud": "voxly_frontend",
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_reset_token(token: str) -> Optional[dict]:
    """Structurally validate a password-reset token (signature, expiry,
    issuer, audience, scope) and return its payload. Does NOT check
    single-use -- the caller must additionally look up the target user and
    call verify_reset_token_fingerprint() with their *current* password hash,
    since the token can't be checked for reuse without knowing who it's for."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            issuer="voxly_api",
            audience="voxly_frontend",
        )
        if payload.get("scope") != "password_reset":
            return None
        return payload
    except InvalidTokenError:
        return None


def verify_reset_token_fingerprint(payload: dict, password_hash: str) -> bool:
    """True if the token's embedded fingerprint still matches the user's
    current password hash -- false once the token has already been redeemed
    once, or the password changed any other way since it was issued."""
    return payload.get("pwfp") == _password_fingerprint(password_hash)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Get the current authenticated user from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token_data = decode_access_token(token)
    if token_data is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    if token_data.token_version != (user.token_version or 0):
        # Token was minted before the user's last password change -- reject
        # it exactly like an expired token rather than a distinct error, so
        # this doesn't become an oracle for "was the password ever changed".
        raise credentials_exception

    return user


def get_user_from_token(token: str, db: Session) -> Optional[User]:
    """Get user from token string (for WebSockets / manual auth)."""
    token_data = decode_access_token(token)
    if token_data is None:
        return None

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None or not user.is_active:
        return None

    if token_data.token_version != (user.token_version or 0):
        return None

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get the current active user."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user
