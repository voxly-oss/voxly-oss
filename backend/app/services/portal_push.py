"""Web Push for the client chat (the Voxly chat link).

When the agency answers on the Voxly channel — a teammate from the inbox or
the AI — every device the client turned notifications on for gets a push, so
a client who closed the tab still hears back. The chat's service worker
(frontend/public/chat-sw.js) skips the notification while the chat is on
screen. Replies on WhatsApp/Telegram don't push: those apps notify already.

Off unless VAPID_PRIVATE_KEY is set. A subscription belongs to the chat link
the device signed in through: turning the link off or regenerating it deletes
its subscriptions (portal.py), and a push service saying the subscription is
gone (404/410) deletes it here.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional, Union
from urllib.parse import urlsplit

import aiohttp
from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from pywebpush import WebPushException, webpush_async
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.client import Client
from app.models.client_chat_link import ClientChatLink
from app.models.portal_push_subscription import PortalPushSubscription
from app.services.portal_auth import agency_name, live_client

logger = logging.getLogger(__name__)

# The push services browsers subscribe through (Chrome/Edge-on-Android/Opera/
# Samsung: FCM; Firefox: Mozilla; Safari: Apple; Edge on Windows: WNS).
# Anything else is refused at subscribe time, so the server never POSTs to an
# address a client made up.
_PUSH_HOSTS = frozenset({
    "fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com",
})
_PUSH_HOST_SUFFIXES = (".notify.windows.com",)

MAX_DEVICES = 10           # per client; registering more drops the oldest
TTL_SECONDS = 24 * 3600    # a phone that's been offline longer doesn't need the ping
SEND_TIMEOUT_SECONDS = 10
PREVIEW_CHARS = 180
_GONE = {404, 410}


# ── Configuration ────────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def _vapid() -> Optional[Vapid]:
    key = settings.VAPID_PRIVATE_KEY.strip()
    if not key:
        return None
    try:
        return Vapid.from_string(private_key=key)
    except Exception as exc:  # never log the key itself
        logger.error("[PUSH] VAPID_PRIVATE_KEY is not a valid key, notifications are off (%s)", type(exc).__name__)
        return None


def enabled() -> bool:
    return _vapid() is not None


def public_key() -> Optional[str]:
    """The applicationServerKey browsers subscribe with (base64url, uncompressed P-256 point)."""
    vapid = _vapid()
    if vapid is None:
        return None
    raw = vapid.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _subject() -> str:
    # Push services (Apple's strictly) want a mailto: or https: contact.
    if settings.VAPID_SUBJECT:
        return settings.VAPID_SUBJECT
    if settings.FRONTEND_URL.startswith("https://"):
        return settings.FRONTEND_URL.rstrip("/")
    return "mailto:admin@example.com"


# ── Subscriptions ────────────────────────────────────────────────────────────


def push_endpoint_allowed(endpoint: str) -> bool:
    try:
        parts = urlsplit(endpoint)
        host = (parts.hostname or "").lower()
        port = parts.port
    except ValueError:
        return False
    if parts.scheme != "https" or parts.username or parts.password or port not in (None, 443):
        return False
    return host in _PUSH_HOSTS or host.endswith(_PUSH_HOST_SUFFIXES)


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def valid_keys(p256dh: str, auth: str) -> bool:
    """p256dh: the device's P-256 public key (65 bytes, uncompressed); auth: a 16-byte secret."""
    try:
        key, secret = _unb64(p256dh), _unb64(auth)
    except (binascii.Error, ValueError):
        return False
    return len(key) == 65 and key[0] == 4 and len(secret) == 16


def save_subscription(
    db: Session, client: Client, link: ClientChatLink, endpoint: str, p256dh: str, auth: str, device: Optional[str],
) -> None:
    """Register (or re-register) a device. An endpoint seen before is moved to
    this client and link — the same browser after the link was regenerated."""
    for attempt in range(2):
        sub = db.query(PortalPushSubscription).filter(PortalPushSubscription.endpoint == endpoint).first()
        if sub is None:
            sub = PortalPushSubscription(endpoint=endpoint)
            db.add(sub)
        sub.client_id, sub.link_id = client.id, link.id
        sub.p256dh, sub.auth, sub.device = p256dh, auth, device
        try:
            db.flush()
            break
        except IntegrityError:  # the same device registered twice at once
            db.rollback()
            if attempt:
                raise
    stale = (
        db.query(PortalPushSubscription)
        .filter(PortalPushSubscription.client_id == client.id)
        .order_by(PortalPushSubscription.created_at.desc(), PortalPushSubscription.id.desc())
        .offset(MAX_DEVICES)
        .all()
    )
    for old in stale:
        db.delete(old)
    db.commit()


def remove_subscription(db: Session, client: Client, endpoint: str) -> None:
    db.query(PortalPushSubscription).filter(
        PortalPushSubscription.client_id == client.id, PortalPushSubscription.endpoint == endpoint,
    ).delete(synchronize_session=False)
    db.commit()


def forget_client_devices(db: Session, client_id: uuid.UUID) -> None:
    """Every device stops being notified (the link was turned off or replaced). Caller commits."""
    db.query(PortalPushSubscription).filter(PortalPushSubscription.client_id == client_id).delete(
        synchronize_session=False,
    )


def device_count(db: Session, link: ClientChatLink) -> int:
    return db.query(PortalPushSubscription).filter(PortalPushSubscription.link_id == link.id).count()


# ── Sending ──────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class _Target:
    id: uuid.UUID
    info: dict


def notification_payload(agency: str, text: str) -> str:
    body = " ".join(text.split())
    if len(body) > PREVIEW_CHARS:
        body = body[: PREVIEW_CHARS - 1].rstrip() + "…"
    return json.dumps({"title": agency, "body": body, "url": "/c", "tag": "voxly-chat"})


def _targets(client_id: uuid.UUID) -> tuple[str, list[_Target]]:
    # A short-lived session, closed before any network call.
    db = SessionLocal()
    try:
        client = live_client(db, client_id)
        if client is None:
            return "", []
        rows = (
            db.query(PortalPushSubscription)
            .join(ClientChatLink, ClientChatLink.id == PortalPushSubscription.link_id)
            .filter(PortalPushSubscription.client_id == client_id, ClientChatLink.revoked_at.is_(None))
            .all()
        )
        targets = [_Target(r.id, {"endpoint": r.endpoint, "keys": {"p256dh": r.p256dh, "auth": r.auth}}) for r in rows]
        return agency_name(db, client), targets
    finally:
        db.close()


def _forget(subscription_ids: list[uuid.UUID]) -> None:
    db = SessionLocal()
    try:
        db.query(PortalPushSubscription).filter(PortalPushSubscription.id.in_(subscription_ids)).delete(
            synchronize_session=False,
        )
        db.commit()
    finally:
        db.close()


async def _send_one(info: dict, payload: str, vapid: Vapid) -> Optional[int]:
    """POST one push. Returns the push service's HTTP status, or None if it couldn't be reached."""
    try:
        response = await webpush_async(
            subscription_info=info,
            data=payload,
            vapid_private_key=vapid,
            vapid_claims={"sub": _subject()},  # a fresh dict: pywebpush fills in aud/exp per endpoint
            ttl=TTL_SECONDS,
            timeout=aiohttp.ClientTimeout(total=SEND_TIMEOUT_SECONDS),
            headers={"Urgency": "high"},
        )
        return response.status
    except WebPushException as exc:
        return exc.response.status if exc.response is not None else None
    except Exception as exc:
        logger.warning("[PUSH] push service unreachable: %s", type(exc).__name__)
        return None


async def notify_client(client_id: uuid.UUID, text: str) -> int:
    """Push `text` to every device the client turned notifications on for.
    Returns how many push services accepted it."""
    vapid = _vapid()
    if vapid is None:
        return 0
    agency, targets = _targets(client_id)
    if not targets:
        return 0
    payload = notification_payload(agency, text)
    statuses = await asyncio.gather(*(_send_one(t.info, payload, vapid) for t in targets))
    gone = [t.id for t, code in zip(targets, statuses) if code in _GONE]
    if gone:
        _forget(gone)
    for code in statuses:
        if code is not None and code >= 400 and code not in _GONE:
            logger.warning("[PUSH] push service refused a notification for client=%s: HTTP %s", client_id, code)
    return sum(1 for code in statuses if code is not None and code < 300)


_pending: set[asyncio.Task] = set()


async def _notify_safely(client_id: uuid.UUID, text: str) -> None:
    try:
        await notify_client(client_id, text)
    except Exception as exc:  # a push failure must never surface anywhere
        logger.error("[PUSH] notify failed for client=%s: %s", client_id, exc, exc_info=True)


def notify_in_background(client_id: Union[str, uuid.UUID], text: str) -> None:
    """Fire and forget: the reply is already in the client's chat, and a slow
    push service must not hold up whoever sent it."""
    if _vapid() is None:
        return
    try:
        cid = client_id if isinstance(client_id, uuid.UUID) else uuid.UUID(str(client_id))
        task = asyncio.get_running_loop().create_task(_notify_safely(cid, text))
    except (ValueError, RuntimeError):
        return
    _pending.add(task)  # keep a reference until it finishes
    task.add_done_callback(_pending.discard)
