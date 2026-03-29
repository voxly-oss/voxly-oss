"""
API Key Management Routes

CRUD operations for API keys:
- Generate new keys
- List keys
- Get key details
- Update key metadata
- Revoke keys
- Rotate keys
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Annotated

from app.database import get_db
from app.models.user import User
from app.models.api_key import APIKey
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.schemas.api_key import (
    APIKeyCreate,
    APIKeyUpdate,
    APIKeyResponse,
    APIKeyCreatedResponse,
    APIKeyListResponse,
)
from app.utils.auth import get_current_user
from app.utils.api_key_auth import generate_api_key

import logging

logger = logging.getLogger(__name__)
router = APIRouter()
API_KEY_NOT_FOUND = "API key not found"


def _get_max_api_keys(user: User, db: Session) -> int:
    """Get the max API keys allowed for this user's plan."""
    subscription = db.query(Subscription).filter(
        Subscription.user_id == user.id,
        Subscription.status == "active"
    ).first()
    
    if subscription and subscription.plan:
        return subscription.plan.max_api_keys
    
    # Default to free plan limits
    free_plan = db.query(Plan).filter(Plan.slug == "free").first()
    return free_plan.max_api_keys if free_plan else 1


@router.post("/", response_model=APIKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(*, 
    request: APIKeyCreate,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Generate a new API key. The full key is returned ONLY in this response."""
    
    # Check limit
    existing_count = db.query(APIKey).filter(
        APIKey.user_id == current_user.id,
        APIKey.is_active == True,
        APIKey.revoked_at.is_(None)
    ).count()
    
    max_keys = _get_max_api_keys(current_user, db)
    
    if existing_count >= max_keys:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"API key limit reached ({max_keys}). Upgrade your plan or revoke unused keys."
        )
    
    # Generate key
    full_key, key_prefix, key_hash = generate_api_key()
    
    # Create DB record
    api_key = APIKey(
        user_id=current_user.id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        label=request.label,
        scopes=request.scopes,
        expires_at=request.expires_at
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    
    logger.info(f"API key created for user {current_user.email}: {key_prefix}...")
    
    return APIKeyCreatedResponse(
        id=api_key.id,
        key=full_key,  # Shown only once
        key_prefix=api_key.key_prefix,
        label=api_key.label,
        scopes=api_key.scopes,
        is_active=api_key.is_active,
        last_used_at=api_key.last_used_at,
        expires_at=api_key.expires_at,
        created_at=api_key.created_at,
        revoked_at=api_key.revoked_at
    )


@router.get("/", response_model=APIKeyListResponse)
async def list_api_keys(*, 
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """List all API keys for the current user."""
    keys = db.query(APIKey).filter(
        APIKey.user_id == current_user.id
    ).order_by(APIKey.created_at.desc()).all()
    
    max_keys = _get_max_api_keys(current_user, db)
    
    return APIKeyListResponse(
        keys=[APIKeyResponse.model_validate(k) for k in keys],
        total=len(keys),
        max_allowed=max_keys
    )


@router.get(
    "/{key_id}",
    response_model=APIKeyResponse,
    responses={404: {"description": API_KEY_NOT_FOUND}},
)
async def get_api_key(*, 
    key_id: str,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Get details for a specific API key."""
    api_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == current_user.id
    ).first()
    
    if not api_key:
        raise HTTPException(status_code=404, detail=API_KEY_NOT_FOUND)
    
    return APIKeyResponse.model_validate(api_key)


@router.patch(
    "/{key_id}",
    response_model=APIKeyResponse,
    responses={404: {"description": API_KEY_NOT_FOUND}},
)
async def update_api_key(*, 
    key_id: str,
    request: APIKeyUpdate,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Update API key label or scopes."""
    api_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == current_user.id
    ).first()
    
    if not api_key:
        raise HTTPException(status_code=404, detail=API_KEY_NOT_FOUND)
    
    if request.label is not None:
        api_key.label = request.label
    if request.scopes is not None:
        api_key.scopes = request.scopes
    
    db.commit()
    db.refresh(api_key)
    
    return APIKeyResponse.model_validate(api_key)


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_200_OK,
    responses={404: {"description": API_KEY_NOT_FOUND}},
)
async def revoke_api_key(*, 
    key_id: str,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Revoke (soft-delete) an API key."""
    api_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == current_user.id
    ).first()
    
    if not api_key:
        raise HTTPException(status_code=404, detail=API_KEY_NOT_FOUND)
    
    from datetime import datetime, timezone
    api_key.is_active = False
    api_key.revoked_at = datetime.now(timezone.utc)
    db.commit()
    
    logger.info(f"API key revoked: {api_key.key_prefix}...")
    
    return {"message": "API key revoked successfully", "key_prefix": api_key.key_prefix}


@router.post(
    "/{key_id}/rotate",
    response_model=APIKeyCreatedResponse,
    responses={404: {"description": "Active API key not found"}},
)
async def rotate_api_key(*, 
    key_id: str,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Rotate an API key — revokes the old key and creates a new one with the same settings."""
    old_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == current_user.id,
        APIKey.is_active == True
    ).first()
    
    if not old_key:
        raise HTTPException(status_code=404, detail="Active API key not found")
    
    from datetime import datetime, timezone
    
    # Revoke old key
    old_key.is_active = False
    old_key.revoked_at = datetime.now(timezone.utc)
    
    # Create new key with same settings
    full_key, key_prefix, key_hash = generate_api_key()
    
    new_key = APIKey(
        user_id=current_user.id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        label=old_key.label,
        scopes=old_key.scopes,
        expires_at=old_key.expires_at
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)
    
    logger.info(f"API key rotated: {old_key.key_prefix}... → {key_prefix}...")
    
    return APIKeyCreatedResponse(
        id=new_key.id,
        key=full_key,
        key_prefix=new_key.key_prefix,
        label=new_key.label,
        scopes=new_key.scopes,
        is_active=new_key.is_active,
        last_used_at=new_key.last_used_at,
        expires_at=new_key.expires_at,
        created_at=new_key.created_at,
        revoked_at=new_key.revoked_at
    )
