"""
BYOK (Bring Your Own Key) — Manage user-provided AI API keys.

Users can store their own Claude, OpenAI, or Gemini API keys
so the platform uses their key for AI responses.
"""

import logging
import base64
from datetime import datetime, timezone
from typing import Annotated, List, Optional
import hashlib

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from cryptography.fernet import Fernet, InvalidToken

from app.database import get_db
from app.models.user import User
from app.models.user_ai_key import UserAIKey
from app.api.v1.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Keys (BYOK)"])

# ─── Supported providers ───
SUPPORTED_PROVIDERS = {
    "claude": {
        "name": "Anthropic (Claude)",
        "prefix": "sk-ant-",
        "placeholder": "sk-ant-api03-...",
        "docs_url": "https://console.anthropic.com/settings/keys",
    },
    "openai": {
        "name": "OpenAI (GPT)",
        "prefix": "sk-",
        "placeholder": "sk-proj-...",
        "docs_url": "https://platform.openai.com/api-keys",
    },
    "gemini": {
        "name": "Google (Gemini)",
        "prefix": "AI",
        "placeholder": "AIza...",
        "docs_url": "https://aistudio.google.com/apikey",
    },
    "deepseek": {
        "name": "DeepSeek",
        "prefix": "sk-",
        "placeholder": "sk-...",
        "docs_url": "https://platform.deepseek.com/api_keys",
    },
    "groq": {
        "name": "Groq",
        "prefix": "gsk_",
        "placeholder": "gsk_...",
        "docs_url": "https://console.groq.com/keys",
    },
    "perplexity": {
        "name": "Perplexity",
        "prefix": "pplx-",
        "placeholder": "pplx-...",
        "docs_url": "https://www.perplexity.ai/settings/api",
    },
    "mistral": {
        "name": "Mistral AI",
        "prefix": "",
        "placeholder": "your-mistral-key...",
        "docs_url": "https://console.mistral.ai/api-keys",
    },

    "xai": {
        "name": "xAI (Grok)",
        "prefix": "xai-",
        "placeholder": "xai-...",
        "docs_url": "https://console.x.ai/",
    },
}


# ─── Key encryption (Fernet; ENCRYPTION_KEY preferred, SECRET_KEY fallback) ───
def _secret_digest(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def _encryption_secrets() -> list[str]:
    """Ordered list of secrets to try, primary first.

    Primary is ENCRYPTION_KEY when set (so rotating the JWT SECRET_KEY never
    bricks stored AI keys); SECRET_KEY is kept as a fallback so keys encrypted
    before ENCRYPTION_KEY was introduced still decrypt. New writes always use
    the primary.
    """
    from app.config import settings

    secrets_list = []
    if settings.ENCRYPTION_KEY:
        secrets_list.append(settings.ENCRYPTION_KEY)
    if settings.SECRET_KEY:
        secrets_list.append(settings.SECRET_KEY)
    if not secrets_list:
        raise RuntimeError("ENCRYPTION_KEY or SECRET_KEY must be set for AI key encryption")
    return secrets_list


def _get_secret_digest() -> bytes:
    """Primary digest, used for encryption and legacy XOR decryption."""
    return _secret_digest(_encryption_secrets()[0])


def _cipher_for(secret: str) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(_secret_digest(secret)))


def _encrypt_key(plain_key: str) -> str:
    """Encrypt API keys with Fernet authenticated encryption using the primary secret."""
    token = _cipher_for(_encryption_secrets()[0]).encrypt(plain_key.encode("utf-8")).decode("utf-8")
    return f"v2:{token}"


def _legacy_decrypt_key(encrypted_key: str) -> str:
    """Backward-compatible decrypt for legacy XOR-encrypted records."""
    key = _get_secret_digest()
    decoded = base64.b64decode(encrypted_key)
    decrypted = bytes(a ^ b for a, b in zip(decoded, (key * (len(decoded) // len(key) + 1))))
    return decrypted.decode()


def _decrypt_key(encrypted_key: str) -> str:
    """Decrypt an API key, trying each configured secret (enables key rotation)."""
    if encrypted_key.startswith("v2:"):
        token = encrypted_key[3:].encode("utf-8")
        for secret in _encryption_secrets():
            try:
                return _cipher_for(secret).decrypt(token).decode("utf-8")
            except InvalidToken:
                continue
        raise ValueError("Failed to decrypt stored AI key")
    try:
        return _legacy_decrypt_key(encrypted_key)
    except Exception as exc:
        raise ValueError("Failed to decrypt stored AI key") from exc


def _mask_key(plain_key: str) -> str:
    """Mask an API key for safe display: sk-ant-api03-...xYz"""
    if len(plain_key) <= 8:
        return "***"
    return plain_key[:8] + "..." + plain_key[-4:]


# ─── Schemas ───
class AIKeyCreate(BaseModel):
    provider: str = Field(..., description="Provider name: claude, openai, gemini")
    api_key: str = Field(..., min_length=10, description="The API key")
    label: Optional[str] = Field(None, max_length=100, description="Optional label")


class AIKeyResponse(BaseModel):
    id: str
    provider: str
    provider_name: str
    label: Optional[str] = None
    key_masked: str
    is_active: bool
    is_valid: Optional[bool] = None
    last_validated_at: Optional[str] = None
    last_used_at: Optional[str] = None
    created_at: str


class AIKeyProviderInfo(BaseModel):
    id: str
    name: str
    prefix: str
    placeholder: str
    docs_url: str
    has_key: bool


# ─── Routes ───

@router.get("/providers", response_model=List[AIKeyProviderInfo])
async def list_providers(*, 
    current_user: Annotated[User , Depends(get_current_user)],
    db: Annotated[Session , Depends(get_db)],
):
    """List all supported AI providers and whether the user has a key for each."""
    user_keys = db.query(UserAIKey).filter(
        UserAIKey.user_id == current_user.id,
        UserAIKey.is_active == True,
    ).all()
    user_provider_set = {k.provider for k in user_keys}
    
    return [
        AIKeyProviderInfo(
            id=pid,
            name=info["name"],
            prefix=info["prefix"],
            placeholder=info["placeholder"],
            docs_url=info["docs_url"],
            has_key=pid in user_provider_set,
        )
        for pid, info in SUPPORTED_PROVIDERS.items()
    ]


@router.get("/", response_model=List[AIKeyResponse])
async def list_ai_keys(*, 
    current_user: Annotated[User , Depends(get_current_user)],
    db: Annotated[Session , Depends(get_db)],
):
    """List all user AI keys (masked)."""
    keys = db.query(UserAIKey).filter(
        UserAIKey.user_id == current_user.id,
    ).order_by(UserAIKey.created_at.desc()).all()
    
    return [
        AIKeyResponse(
            id=str(k.id),
            provider=k.provider,
            provider_name=SUPPORTED_PROVIDERS.get(k.provider, {}).get("name", k.provider),
            label=k.label,
            key_masked=_mask_key(_decrypt_key(k.api_key_encrypted)),
            is_active=k.is_active,
            is_valid=k.is_valid,
            last_validated_at=k.last_validated_at.isoformat() if k.last_validated_at else None,
            last_used_at=k.last_used_at.isoformat() if k.last_used_at else None,
            created_at=k.created_at.isoformat(),
        )
        for k in keys
    ]


@router.post(
    "/",
    response_model=AIKeyResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"description": "Unsupported provider"}},
)
async def add_ai_key(*, 
    data: AIKeyCreate,
    current_user: Annotated[User , Depends(get_current_user)],
    db: Annotated[Session , Depends(get_db)],
):
    """Add or replace an AI API key for a provider."""
    if data.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider: {data.provider}. Supported: {', '.join(SUPPORTED_PROVIDERS.keys())}",
        )
    
    # Deactivate existing key for this provider (one active key per provider)
    existing = db.query(UserAIKey).filter(
        UserAIKey.user_id == current_user.id,
        UserAIKey.provider == data.provider,
        UserAIKey.is_active == True,
    ).first()
    
    if existing:
        existing.is_active = False
        existing.updated_at = datetime.now(timezone.utc)
    
    # Create new key
    new_key = UserAIKey(
        user_id=current_user.id,
        provider=data.provider,
        api_key_encrypted=_encrypt_key(data.api_key),
        label=data.label or f"My {SUPPORTED_PROVIDERS[data.provider]['name']} key",
        is_active=True,
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)
    
    logger.info(f"User {current_user.email} added {data.provider} AI key")
    
    return AIKeyResponse(
        id=str(new_key.id),
        provider=new_key.provider,
        provider_name=SUPPORTED_PROVIDERS[data.provider]["name"],
        label=new_key.label,
        key_masked=_mask_key(data.api_key),
        is_active=True,
        is_valid=None,
        last_validated_at=None,
        last_used_at=None,
        created_at=new_key.created_at.isoformat(),
    )


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "AI key not found"}},
)
async def delete_ai_key(*, 
    key_id: str,
    current_user: Annotated[User , Depends(get_current_user)],
    db: Annotated[Session , Depends(get_db)],
):
    """Delete (deactivate) an AI key."""
    key = db.query(UserAIKey).filter(
        UserAIKey.id == key_id,
        UserAIKey.user_id == current_user.id,
    ).first()
    
    if not key:
        raise HTTPException(status_code=404, detail="AI key not found")
    
    key.is_active = False
    key.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    logger.info(f"User {current_user.email} deleted {key.provider} AI key")


@router.post(
    "/{key_id}/validate",
    responses={404: {"description": "AI key not found"}},
)
async def validate_ai_key(*, 
    key_id: str,
    current_user: Annotated[User , Depends(get_current_user)],
    db: Annotated[Session , Depends(get_db)],
):
    """Validate an AI key by making a test API call."""
    key = db.query(UserAIKey).filter(
        UserAIKey.id == key_id,
        UserAIKey.user_id == current_user.id,
        UserAIKey.is_active == True,
    ).first()
    
    if not key:
        raise HTTPException(status_code=404, detail="AI key not found")
    
    try:
        from app.services.ai_providers import get_provider
        decrypted = _decrypt_key(key.api_key_encrypted)
        provider = get_provider(key.provider, api_key=decrypted)
        is_valid = await provider.health_check()
    except ValueError:
        # Provider not yet implemented
        is_valid = None
    except Exception as e:
        logger.error(f"AI key validation failed: {e}")
        is_valid = False
    
    key.is_valid = is_valid
    key.last_validated_at = datetime.now(timezone.utc)
    key.updated_at = datetime.now(timezone.utc)
    db.commit()

    if is_valid:
        message = "Key is valid ✅"
    elif is_valid is None:
        message = "Provider not available yet"
    else:
        message = "Key is invalid or expired ❌"
    
    return {
        "id": str(key.id),
        "provider": key.provider,
        "is_valid": is_valid,
        "message": message,
    }
