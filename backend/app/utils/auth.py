from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
import hashlib
import secrets

from fastapi import Depends, HTTPException, Request, status
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
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            issuer="voxly_api",
            audience="voxly_frontend",
        )
        user_id: str = payload.get("sub")
        email: str = payload.get("email")

        if user_id is None:
            return None

        return TokenData(user_id=UUID(user_id), email=email)
    except InvalidTokenError:
        return None


def create_reset_token(email: str) -> str:
    """Create a 15-minute password reset token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode = {
        "exp": expire,
        "sub": email,
        "scope": "password_reset",
        "iss": "voxly_api",
        "aud": "voxly_frontend",
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_reset_token(token: str) -> Optional[str]:
    """Verify a password reset token and return the email."""
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
        return payload.get("sub")
    except InvalidTokenError:
        return None


def _hash_refresh_token(token: str) -> str:
    """SHA-256 of a refresh token for storage/lookup (never store plaintext)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_refresh_token(db: Session, user_id) -> str:
    """Create and persist a new refresh token; return the plaintext (shown once)."""
    from app.models.refresh_token import RefreshToken

    plaintext = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(
        user_id=user_id,
        token_hash=_hash_refresh_token(plaintext),
        expires_at=expires,
    ))
    db.commit()
    return plaintext


def rotate_refresh_token(db: Session, token: str):
    """Validate a refresh token and rotate it (single-use).

    Returns the owning User on success, or None if the token is unknown,
    revoked, or expired. The old token is always revoked on a valid use.
    """
    from app.models.refresh_token import RefreshToken

    row = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == _hash_refresh_token(token))
        .first()
    )
    if row is None or row.revoked_at is not None:
        return None, None

    now = datetime.now(timezone.utc)
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        return None, None

    # Rotate: revoke the presented token, mint a fresh one.
    row.revoked_at = now
    db.commit()
    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None or not user.is_active:
        return None, None
    new_token = issue_refresh_token(db, user.id)
    return user, new_token


def revoke_refresh_token(db: Session, token: str) -> bool:
    """Revoke a refresh token (logout). Returns True if a live token was revoked."""
    from app.models.refresh_token import RefreshToken

    row = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == _hash_refresh_token(token))
        .first()
    )
    if row is None or row.revoked_at is not None:
        return False
    row.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return True


async def get_current_user(
    request: Request,
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

    # Expose the resolved user id for the usage-metering middleware.
    request.state.user_id = str(user.id)
    return user


def get_user_from_token(token: str, db: Session) -> Optional[User]:
    """Get user from token string (for WebSockets / manual auth)."""
    token_data = decode_access_token(token)
    if token_data is None:
        return None

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None or not user.is_active:
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
