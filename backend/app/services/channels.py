"""Channel adapters — the one interface every messaging channel implements.

WhatsApp, Telegram and the native Voxly chat link today; Slack plugs in here
later. Code outside this module should never branch on the channel name to
send something: resolve an adapter and call it.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional, Protocol

from sqlalchemy.orm import object_session

from app.models.client import Client
from app.models.client_chat_link import ClientChatLink
from app.services import portal_push, telegram_service, whatsapp_service

logger = logging.getLogger(__name__)


@dataclass
class SendResult:
    ok: bool
    # Provider message id. The current senders don't surface one, so this is
    # None for now; delivery/read receipts will key off it once they do.
    external_id: Optional[str] = None
    error: Optional[str] = None


class ChannelAdapter(Protocol):
    name: str

    def address_for(self, client: Client) -> Optional[str]:
        """Where this client is reached on this channel, or None if not configured."""
        ...

    async def send_text(self, address: str, text: str) -> SendResult:
        ...


class WhatsAppAdapter:
    name = "whatsapp"

    def address_for(self, client: Client) -> Optional[str]:
        return client.phone or None

    async def send_text(self, address: str, text: str) -> SendResult:
        # Looked up at call time (not imported by name) so tests can stub
        # whatsapp_service.send_whatsapp_message.
        ok = await whatsapp_service.send_whatsapp_message(to_number=address, message=text)
        return SendResult(ok=bool(ok), error=None if ok else "WhatsApp provider rejected the message")


class TelegramAdapter:
    name = "telegram"

    def address_for(self, client: Client) -> Optional[str]:
        return client.telegram_chat_id or None

    async def send_text(self, address: str, text: str) -> SendResult:
        ok = await telegram_service.send_telegram_message(address, text)
        return SendResult(ok=bool(ok), error=None if ok else "Telegram rejected the message")


class VoxlyAdapter:
    """The native channel: the client's personal chat link (web / PWA).

    There is no provider to hand the text to — the message row already
    exists and message_store pushes it to the client's portal socket — so
    "sent" here means it is in the client's Voxly inbox. Devices that turned
    notifications on also get a Web Push, in the background and best effort.
    Reachable while the client has an active chat link, even before they
    first open it.
    """
    name = "voxly"

    def address_for(self, client: Client) -> Optional[str]:
        db = object_session(client)
        if db is None:
            return None
        has_link = (
            db.query(ClientChatLink.id)
            .filter(ClientChatLink.client_id == client.id, ClientChatLink.revoked_at.is_(None))
            .first()
        )
        return str(client.id) if has_link else None

    async def send_text(self, address: str, text: str) -> SendResult:
        portal_push.notify_in_background(address, text)
        return SendResult(ok=True)


_ADAPTERS: dict[str, ChannelAdapter] = {
    "whatsapp": WhatsAppAdapter(),
    "telegram": TelegramAdapter(),
    "voxly": VoxlyAdapter(),
}

SUPPORTED_CHANNELS = tuple(_ADAPTERS)


def get_adapter(channel: str) -> Optional[ChannelAdapter]:
    return _ADAPTERS.get(channel)


async def send_via(channel: str, address: str, text: str) -> SendResult:
    adapter = get_adapter(channel)
    if adapter is None:
        return SendResult(ok=False, error=f"Unsupported channel: {channel}")
    try:
        return await adapter.send_text(address, text)
    except Exception as exc:  # a provider outage must not crash the caller
        logger.error("[%s] send failed: %s", channel, exc)
        return SendResult(ok=False, error="Delivery failed — the channel provider returned an error")
