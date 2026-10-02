"""Client portal auth — the native Voxly channel's chat links and sessions.

Two credentials, built so neither can stand in for the other or for an
agency login:

- Link token  `<link id>.<mac>` (base64url): the client's personal chat link.
  Never stored — it is the link row's id plus an HMAC keyed by SECRET_KEY,
  so the agency can copy the same link again and a database leak reveals
  no usable link.
- Session token: a JWT with audience "voxly_client" and scope
  "client_portal". decode_access_token() rejects it twice over (wrong
  audience, and any scope claim), and get_portal_context() rejects agency
  tokens (wrong audience). Every request re-checks that the link is still
  active, so revoking or regenerating a link ends its sessions at once.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.client import Client
from app.models.client_chat_link import ClientChatLink
from app.models.organization import Organization
from app.models.user import User

PORTAL_AUDIENCE = "voxly_client"
PORTAL_SCOPE = "client_portal"
SESSION_DAYS = 30


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _mac(link_id: uuid.UUID) -> bytes:
    return hmac.new(settings.SECRET_KEY.encode(), b"voxly-chat-link:" + link_id.bytes, hashlib.sha256).digest()[:16]


def link_token(link_id: uuid.UUID) -> str:
    return f"{_b64(link_id.bytes)}.{_b64(_mac(link_id))}"


def parse_link_token(token: str) -> Optional[uuid.UUID]:
    """The link id if the token is genuine, else None (never raises)."""
    try:
        id_part, mac_part = token.strip().split(".", 1)
        link_id = uuid.UUID(bytes=_unb64(id_part))
        if not hmac.compare_digest(_unb64(mac_part), _mac(link_id)):
            return None
        return link_id
    except (ValueError, binascii.Error):
        return None


def link_url(link: ClientChatLink) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/c/{link_token(link.id)}"


def create_session_token(link: ClientChatLink) -> tuple[str, int]:
    """A device session for this link: (token, lifetime in seconds)."""
    lifetime = timedelta(days=SESSION_DAYS)
    payload = {
        "sub": str(link.client_id),
        "lid": str(link.id),
        "scope": PORTAL_SCOPE,
        "iss": "voxly_api",
        "aud": PORTAL_AUDIENCE,
        "exp": datetime.now(timezone.utc) + lifetime,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM), int(lifetime.total_seconds())


def decode_session_token(token: str) -> Optional[tuple[uuid.UUID, uuid.UUID]]:
    """(client_id, link_id) for a valid portal session token, else None."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
            issuer="voxly_api", audience=PORTAL_AUDIENCE,
        )
        if payload.get("scope") != PORTAL_SCOPE:
            return None
        return uuid.UUID(payload["sub"]), uuid.UUID(payload["lid"])
    except (InvalidTokenError, ValueError, KeyError, TypeError):
        return None


def active_link(db: Session, link_id: uuid.UUID, client_id: Optional[uuid.UUID] = None) -> Optional[ClientChatLink]:
    query = db.query(ClientChatLink).filter(ClientChatLink.id == link_id, ClientChatLink.revoked_at.is_(None))
    if client_id is not None:
        query = query.filter(ClientChatLink.client_id == client_id)
    return query.first()


def live_client(db: Session, client_id: uuid.UUID) -> Optional[Client]:
    return db.query(Client).filter(Client.id == client_id, Client.deleted_at.is_(None)).first()


def agency_name(db: Session, client: Client) -> str:
    """Who the client is chatting with: the organization's name, else the
    owner's agency or own name."""
    name = None
    if client.org_id:
        org = db.get(Organization, client.org_id)
        name = org.name if org else None
    if not name:
        owner = db.get(User, client.user_id)
        name = (owner.agency_name or owner.full_name) if owner else None
    return name or "Your agency"


@dataclass
class PortalContext:
    client: Client
    link: ClientChatLink


def resolve_session(db: Session, token: str) -> Optional[PortalContext]:
    ids = decode_session_token(token)
    if not ids:
        return None
    client_id, link_id = ids
    link = active_link(db, link_id, client_id)
    client = live_client(db, client_id) if link else None
    return PortalContext(client=client, link=link) if client else None


def get_portal_context(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[Optional[str], Header()] = None,
) -> PortalContext:
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else None
    context = resolve_session(db, token) if token else None
    if context is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This chat link is no longer active. Ask your agency for a new one.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return context


_BROWSERS = (("Edg/", "Edge"), ("OPR/", "Opera"), ("SamsungBrowser", "Samsung Internet"),
             ("Firefox/", "Firefox"), ("Chrome/", "Chrome"), ("Safari/", "Safari"))
_SYSTEMS = (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"), ("Windows", "Windows"),
            ("Mac OS X", "Mac"), ("CrOS", "ChromeOS"), ("Linux", "Linux"))


def device_label(user_agent: Optional[str]) -> Optional[str]:
    """"Chrome on Android" — enough for an agency to spot a forwarded link,
    without keeping the raw user agent or the IP."""
    if not user_agent:
        return None
    browser = next((name for marker, name in _BROWSERS if marker in user_agent), "Browser")
    system = next((name for marker, name in _SYSTEMS if marker in user_agent), None)
    return f"{browser} on {system}" if system else browser
