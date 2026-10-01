"""Persistence, delivery and realtime fan-out for `messages`.

Every message in a conversation — client, AI or human agent, inbound or
outbound — goes through here, so the thread the inbox shows is the thread
that actually happened.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.conversation_state import ConversationState
from app.models.message import Message
from app.models.project import Project
from app.services.channels import SendResult, get_adapter, send_via
from app.websockets.manager import build_event, manager, portal_manager

logger = logging.getLogger(__name__)

# While a teammate has put a conversation in one of these states, a human owns
# it and the AI must not auto-reply. ("Take over" sets awaiting_human; "Mark
# resolved" hands it back.) Before this, takeover was cosmetic — the AI kept
# replying. The pipeline also sets awaiting_human on its own after a failed AI
# turn; that only flags it for attention and must not silence the AI for good.
HUMAN_OWNED_STATES = frozenset({"awaiting_human", "escalated"})


def _human_owned(state: Optional[ConversationState]) -> bool:
    return bool(state and state.status in HUMAN_OWNED_STATES and state.updated_by_user_id is not None)


def serialize(message: Message) -> dict:
    return {
        "id": str(message.id),
        "client_id": str(message.client_id),
        "project_id": str(message.project_id) if message.project_id else None,
        "channel": message.channel,
        "direction": message.direction,
        "author_type": message.author_type,
        "author_user_id": str(message.author_user_id) if message.author_user_id else None,
        "body": message.body,
        "status": message.status,
        "error": message.error,
        "reply_to_id": str(message.reply_to_id) if message.reply_to_id else None,
        "model_used": message.model_used,
        "created_at": message.created_at.isoformat() + "Z" if message.created_at else None,
    }


def visible_to_client(message: Message) -> bool:
    """What the client's own Voxly chat shows: everything they wrote, on any
    channel, and every reply that actually went out. A reply that is still
    queued or failed never reached them, so it isn't shown as if it had."""
    return message.direction == "inbound" or message.status == "sent"


def serialize_for_client(message: Message) -> dict:
    """The client-facing shape: no teammate ids, models, errors or project ids."""
    return {
        "id": str(message.id),
        "direction": message.direction,
        "author_type": message.author_type,
        "channel": message.channel,
        "body": message.body,
        "status": message.status,
        "created_at": message.created_at.isoformat() + "Z" if message.created_at else None,
    }


async def broadcast_message(client: Client, message: Message, event: str = "message.created") -> None:
    """Realtime fan-out to the client owner's dashboards, and — for what the
    client may see — to the client's own chat. Never raises: a dropped socket
    must not fail the message itself."""
    try:
        await manager.broadcast(
            build_event(
                event,
                payload={"message": serialize(message)},
                conversation_id=str(client.id),
                organization_id=str(client.org_id) if getattr(client, "org_id", None) else None,
            ),
            str(client.user_id),
            conversation_id=str(client.id),
        )
    except Exception as exc:
        logger.error("WebSocket broadcast (%s) failed: %s", event, exc)
    if visible_to_client(message):
        try:
            await portal_manager.broadcast(
                build_event(event, payload={"message": serialize_for_client(message)}, conversation_id=str(client.id)),
                str(client.id),
            )
        except Exception as exc:
            logger.error("Portal broadcast (%s) failed: %s", event, exc)


def ai_paused(db: Session, client: Client) -> bool:
    state = db.query(ConversationState).filter(ConversationState.client_id == client.id).first()
    return _human_owned(state)


def record_inbound(
    db: Session,
    client: Client,
    channel: str,
    body: str,
    project: Optional[Project] = None,
    language: Optional[str] = None,
) -> Message:
    message = Message(
        id=uuid.uuid4(),
        client_id=client.id,
        project_id=project.id if project else None,
        channel=channel,
        direction="inbound",
        author_type="client",
        body=body or "",
        status="received",
        language=language,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def record_outbound(
    db: Session,
    client: Client,
    channel: str,
    body: str,
    author_type: str,
    author_user_id: Optional[uuid.UUID] = None,
    reply_to: Optional[Message] = None,
    project: Optional[Project] = None,
    model_used: Optional[str] = None,
    tokens_used: Optional[int] = None,
    ai_response_time_ms: Optional[int] = None,
) -> Message:
    message = Message(
        id=uuid.uuid4(),
        client_id=client.id,
        project_id=project.id if project else None,
        channel=channel,
        direction="outbound",
        author_type=author_type,
        author_user_id=author_user_id,
        body=body,
        status="queued",
        reply_to_id=reply_to.id if reply_to else None,
        model_used=model_used,
        tokens_used=tokens_used,
        ai_response_time_ms=ai_response_time_ms,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def apply_send_result(db: Session, message: Message, result: SendResult) -> Message:
    message.status = "sent" if result.ok else "failed"
    message.error = None if result.ok else (result.error or "Delivery failed")
    message.external_id = result.external_id
    db.commit()
    db.refresh(message)
    return message


async def deliver(db: Session, client: Client, message: Message, address: Optional[str] = None) -> Message:
    """Send a queued outbound message over its channel, record the outcome,
    and broadcast the status change."""
    adapter = get_adapter(message.channel)
    target = address or (adapter.address_for(client) if adapter else None)
    if not target:
        result = SendResult(ok=False, error=f"{client.name} has no {message.channel} address on file")
    else:
        result = await send_via(message.channel, target, message.body)
    apply_send_result(db, message, result)
    await broadcast_message(client, message, event="message.updated")
    return message


async def retry(db: Session, client: Client, message: Message) -> Message:
    """Re-send a failed outbound message in place (same row, same thread
    position), so the thread never shows a failed copy next to a sent one."""
    message.status = "queued"
    message.error = None
    db.commit()
    db.refresh(message)
    await broadcast_message(client, message, event="message.updated")
    return await deliver(db, client, message)


def default_channel_for(db: Session, client: Client) -> Optional[str]:
    """Reply on the channel the client last wrote on; otherwise the first
    channel they have an address for."""
    last_inbound = (
        db.query(Message)
        .filter(Message.client_id == client.id, Message.direction == "inbound")
        .order_by(Message.created_at.desc())
        .first()
    )
    if last_inbound and get_adapter(last_inbound.channel):
        return last_inbound.channel
    for name in ("whatsapp", "telegram", "voxly"):
        adapter = get_adapter(name)
        if adapter and adapter.address_for(client):
            return name
    return None


async def send_agent_message(db: Session, client: Client, user_id: uuid.UUID, text: str, channel: str) -> Message:
    """A human teammate replies in the thread: persist, deliver, broadcast, and
    make sure the AI stays out of the conversation until it's handed back."""
    from app.services.messaging_core import broadcast_state_changed, upsert_conversation_state  # avoid import cycle

    message = record_outbound(db, client, channel, text, author_type="agent", author_user_id=user_id)
    await broadcast_message(client, message)
    await deliver(db, client, message)

    state = db.query(ConversationState).filter(ConversationState.client_id == client.id).first()
    if not _human_owned(state):
        state = upsert_conversation_state(db, client.id, "awaiting_human", updated_by_user_id=user_id)
        await broadcast_state_changed(client, state)
    return message
