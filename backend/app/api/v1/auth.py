from datetime import timedelta
from typing import Annotated, Optional
import urllib.parse
import secrets
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, status, BackgroundTasks
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserResponse,
    Token,
    UserLogin,
    PasswordResetRequest,
    PasswordResetConfirm,
)
from app.utils.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    create_reset_token,
    verify_reset_token,
)
from app.rate_limit import limiter
from app.services.email_service import send_password_reset_email
router = APIRouter()
OAUTH_STATE_COOKIE_PREFIX = "voxly_oauth_state_"
USER_ACCOUNT_DEACTIVATED = "User account is deactivated"
APPLICATION_JSON = "application/json"


def _get_oauth_cookie_name(provider: str) -> str:
    return f"{OAUTH_STATE_COOKIE_PREFIX}{provider}"


def _is_secure_cookie_request(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    return forwarded_proto.lower() == "https"


# ── Google OAuth ──

class GoogleAuthRequest(BaseModel):
    token: str  # Google ID token from frontend

class GoogleAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_new_user: bool = False


@router.post("/google", response_model=GoogleAuthResponse)
async def google_auth(*, 
    request: GoogleAuthRequest,
    db: Annotated[Session , Depends(get_db)],
):
    """Authenticate with Google token (access token or ID token). Creates account if new user."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sign-in is not configured",
        )

    google_id = None
    email = None
    name = ""

    # Try verifying as ID token first
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        idinfo = google_id_token.verify_oauth2_token(
            request.token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
        google_id = idinfo.get("sub")
        email = idinfo.get("email")
        name = idinfo.get("name", "")
    except (ValueError, Exception):
        # Fallback: treat as access token, verify via Google userinfo API
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {request.token}"},
                )
                if resp.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid Google token",
                    )
                userinfo = resp.json()
                google_id = userinfo.get("sub")
                email = userinfo.get("email")
                name = userinfo.get("name", "")
        except httpx.HTTPError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to verify Google token",
            )

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account has no email",
        )

    is_new_user = False

    # 1. Find user by google_id
    user = db.query(User).filter(User.google_id == google_id).first()

    if not user:
        # 2. Find user by email (link existing account)
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.google_id = google_id
            db.commit()
        else:
            # 3. Create new user
            user = User(
                email=email,
                full_name=name,
                google_id=google_id,
                password_hash=None,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new_user = True

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=USER_ACCOUNT_DEACTIVATED,
        )

    # Create JWT
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
        expires_delta=access_token_expires,
    )

    return GoogleAuthResponse(
        access_token=access_token,
        is_new_user=is_new_user,
    )


# ── GitHub OAuth ──

@router.get("/github")
async def github_redirect(*, request: Request):
    """Redirect user to GitHub OAuth authorization page."""
    if not settings.GITHUB_OAUTH_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub Sign-in is not configured",
        )
    state = secrets.token_urlsafe(32)
    params = urllib.parse.urlencode({
        "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
        "redirect_uri": f"{settings.FRONTEND_URL}/auth/callback?provider=github",
        "scope": "read:user user:email",
        "state": state,
    })
    response = RedirectResponse(f"https://github.com/login/oauth/authorize?{params}")
    response.set_cookie(
        key=_get_oauth_cookie_name("github"),
        value=state,
        httponly=True,
        secure=_is_secure_cookie_request(request),
        samesite="lax",
        max_age=600,
    )
    return response


@router.post(
    "/github/callback",
    responses={
        400: {"description": "No verified email found on GitHub account"},
        401: {"description": "GitHub authentication failed"},
        403: {"description": USER_ACCOUNT_DEACTIVATED},
    },
)
async def github_callback(*, 
    request: Request,
    code: str,
    state: str,
    db: Annotated[Session , Depends(get_db)],
):
    """Exchange GitHub authorization code for user token."""
    if not settings.GITHUB_OAUTH_CLIENT_ID or not settings.GITHUB_OAUTH_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub Sign-in is not configured",
        )
    expected_state = request.cookies.get(_get_oauth_cookie_name("github"))
    if not expected_state or not hmac.compare_digest(expected_state, state):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state",
        )

    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
                "client_secret": settings.GITHUB_OAUTH_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": APPLICATION_JSON},
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Failed to exchange GitHub code")
        token_data = token_resp.json()
        gh_access_token = token_data.get("access_token")
        if not gh_access_token:
            raise HTTPException(status_code=401, detail=token_data.get("error_description", "GitHub auth failed"))

        # Fetch user info
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {gh_access_token}", "Accept": APPLICATION_JSON},
        )
        gh_user = user_resp.json()

        # Fetch primary email (may be private)
        email_resp = await client.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {gh_access_token}", "Accept": APPLICATION_JSON},
        )
        emails = email_resp.json()
        primary_email = next(
            (e["email"] for e in emails if e.get("primary") and e.get("verified")),
            gh_user.get("email"),
        )

    if not primary_email:
        raise HTTPException(status_code=400, detail="No verified email found on GitHub account")

    github_id = str(gh_user.get("id"))
    name = gh_user.get("name") or gh_user.get("login", "")
    is_new_user = False

    # Find or create user
    user = db.query(User).filter(User.github_id == github_id).first()
    if not user:
        user = db.query(User).filter(User.email == primary_email).first()
        if user:
            user.github_id = github_id
            db.commit()
        else:
            user = User(
                email=primary_email,
                full_name=name,
                github_id=github_id,
                password_hash=None,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new_user = True

    if not user.is_active:
        raise HTTPException(status_code=403, detail=USER_ACCOUNT_DEACTIVATED)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
        expires_delta=access_token_expires,
    )
    response = JSONResponse(
        {"access_token": access_token, "token_type": "bearer", "is_new_user": is_new_user}
    )
    response.delete_cookie(_get_oauth_cookie_name("github"))
    return response



@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(*, 
    request: Request,
    user_data: UserCreate,
    db: Annotated[Session , Depends(get_db)],
):
    """Register a new user."""
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=user_data.email,
        password_hash=hashed_password,
        full_name=user_data.full_name,
        agency_name=user_data.agency_name,
        phone=user_data.phone,
    )
    
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user"
        )
    
    return db_user


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(*, 
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session , Depends(get_db)],
):
    """Authenticate user and return JWT token."""
    # Find user by email (username field contains email)
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=USER_ACCOUNT_DEACTIVATED
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
        expires_delta=access_token_expires
    )
    
    return Token(access_token=access_token, token_type="bearer")


@router.post("/refresh", response_model=Token)
async def refresh_token(*, 
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Refresh the access token."""
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(current_user.id), "email": current_user.email},
        expires_delta=access_token_expires
    )
    
    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def get_me(*, 
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Get current authenticated user profile."""
    return current_user


# ── Pydantic models for profile & password (inline for security isolation) ──
from pydantic import BaseModel as _BaseModel, Field as _Field, field_validator
import re as _re

class _ProfileUpdate(_BaseModel):
    full_name: str | None = _Field(None, max_length=255)
    agency_name: str | None = _Field(None, max_length=255)
    phone: str | None = _Field(None, max_length=50)

    @field_validator("full_name", "agency_name", mode="before")
    @classmethod
    def _strip_and_sanitize(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        # Strip HTML/script tags — defence-in-depth
        v = _re.sub(r"<[^>]+>", "", v)
        return v or None

    @field_validator("phone", mode="before")
    @classmethod
    def _validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = _re.sub(r"[^\d+\-() ]", "", v.strip())
        return v or None


class _PasswordChange(_BaseModel):
    current_password: str = _Field(..., min_length=1)
    new_password: str = _Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        if not _re.search(r"[A-Z]", v):
            raise ValueError("Must contain at least one uppercase letter")
        if not _re.search(r"[a-z]", v):
            raise ValueError("Must contain at least one lowercase letter")
        if not _re.search(r"\d", v):
            raise ValueError("Must contain at least one digit")
        return v


@router.put("/profile", response_model=UserResponse)
async def update_profile(*, 
    profile_data: _ProfileUpdate,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Update the current user's profile (name, agency, phone)."""
    update_fields = profile_data.model_dump(exclude_unset=True)
    if not update_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    # Never allow escalation via this endpoint
    forbidden = {"email", "password_hash", "is_active", "subscription_tier", "id"}
    update_fields = {k: v for k, v in update_fields.items() if k not in forbidden}

    for field, value in update_fields.items():
        setattr(current_user, str(field), value)

    try:
        db.commit()
        db.refresh(current_user)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile"
        )

    return current_user


@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(*, 
    password_data: _PasswordChange,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Change the current user's password. Requires old password verification."""
    # Verify current password — constant-time comparison via bcrypt
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )

    # Prevent reusing the same password
    if verify_password(password_data.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must differ from current password"
        )

    current_user.password_hash = get_password_hash(password_data.new_password)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update password"
        )

    return {"message": "Password updated successfully"}


@router.post("/password-reset/request", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def request_password_reset(*, 
    request: Request,
    request_data: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[Session , Depends(get_db)],
):
    """
    Request a password reset. 
    In production, this would send an email. 
    For now, it logs the token to the console.
    """
    user = db.query(User).filter(User.email == request_data.email).first()
    
    # Always return 200 to prevent email enumeration
    if not user:
        return {"message": "If that email exists, a reset link has been sent."}
    
    token = create_reset_token(user.email)
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    
    # Send email asynchronously
    background_tasks.add_task(send_password_reset_email, user.email, reset_link)
    
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Password reset task queued.")
    
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/password-reset/confirm", status_code=status.HTTP_200_OK)
async def confirm_password_reset(*, 
    confirm_data: PasswordResetConfirm,
    db: Annotated[Session , Depends(get_db)],
):
    """Validate token and update password."""
    email = verify_reset_token(confirm_data.token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.password_hash = get_password_hash(confirm_data.new_password)
    
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset password"
        )
    
    return {"message": "Password has been reset successfully"}


@router.get("/me/export", response_model=dict, status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def export_user_data(*, 
    request: Request,
    current_user: Annotated[User , Depends(get_current_user)],
    db: Annotated[Session , Depends(get_db)],
):
    """GDPR Endpoint: Export all user data as JSON."""
    from app.models.client import Client
    from app.models.project import Project
    from app.models.ai_key import AIKey
    from app.models.api_key import APIKey
    
    clients = db.query(Client).filter(Client.user_id == current_user.id).all()
    projects = db.query(Project).join(Client).filter(Client.user_id == current_user.id).all()
    ai_keys = db.query(AIKey).filter(AIKey.user_id == current_user.id).all()
    api_keys = db.query(APIKey).filter(APIKey.user_id == current_user.id).all()
    
    export_data = {
        "user_profile": {
            "id": str(current_user.id),
            "email": current_user.email,
            "full_name": current_user.full_name,
            "agency_name": current_user.agency_name,
            "subscription_tier": current_user.subscription_tier,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        },
        "clients": [
            {
                "id": str(c.id),
                "name": c.name,
                "phone": c.phone,
                "email": c.email,
                "company": c.company,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            } for c in clients
        ],
        "projects": [
            {
                "id": str(p.id),
                "client_id": str(p.client_id),
                "name": p.name,
                "description": p.description,
                "status": p.status,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            } for p in projects
        ],
        "ai_keys": [
            {
                "id": str(k.id),
                "provider": k.provider_name,
                "created_at": k.created_at.isoformat() if k.created_at else None,
            } for k in ai_keys
        ],
    }
    
    return export_data


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("2/minute")
async def delete_user_account(*, 
    request: Request,
    current_user: Annotated[User , Depends(get_current_user)],
    db: Annotated[Session , Depends(get_db)],
):
    """GDPR Endpoint: Permanently and fully erase a user account."""
    try:
        db.delete(current_user)
        db.commit()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to delete user {current_user.id}: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account"
        )
    return None

