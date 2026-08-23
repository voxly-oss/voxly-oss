"""
Shared Messaging Core — Single AI pipeline for all channels.

Both WhatsApp and Telegram handlers delegate here. This module owns:
  - Client lookup (by phone or telegram_chat_id)
  - Project fetch + GitHub stats
  - AI response generation
  - Chat history persistence
  - WebSocket broadcast to dashboard
"""
import uuid
import logging
import time
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.client import Client
from app.models.project import Project
from app.models.milestone import Milestone
from app.models.chat_history import ChatHistory
from app.models.conversation_state import ConversationState
from app.services.ai_service import generate_client_response
from app.services.cache_service import get_github_stats_cached
from app.services.localization import detect_language, t
from app.services.transcription_service import transcribe_audio
from app.websockets.manager import manager, build_event

logger = logging.getLogger(__name__)


# ── Client lookup ──────────────────────────────────────────────────────────────

def find_client_by_phone(db: Session, phone: str) -> Optional[Client]:
    """Look up client by phone number (WhatsApp identifier)."""
    return db.query(Client).filter(Client.phone == phone).first()


def find_client_by_telegram(db: Session, chat_id: str) -> Optional[Client]:
    """Look up client by Telegram chat ID."""
    return db.query(Client).filter(Client.telegram_chat_id == str(chat_id)).first()


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _get_client_project(db: Session, client: Client) -> Optional[Project]:
    """Get the active project for a client, falling back to any project."""
    project = (
        db.query(Project)
        .filter(Project.client_id == client.id, Project.status == "active")
        .first()
    )
    if project:
        return project
    return db.query(Project).filter(Project.client_id == client.id).first()


async def _get_project_github_stats(project: Optional[Project]) -> dict:
    if not project or not project.github_repo:
        return {}
    try:
        return await get_github_stats_cached(str(project.id), project.github_repo)
    except Exception:
        return {}


def _serialize_project_milestones(db: Session, project: Optional[Project]) -> list[dict]:
    if not project:
        return []
    ms_rows = db.query(Milestone).filter(Milestone.project_id == project.id).all()
    return [
        {
            "title": m.title,
            "status": m.status,
            "progress": getattr(m, "progress", 0),
            "due_date": str(m.due_date) if getattr(m, "due_date", None) else None,
        }
        for m in ms_rows
    ]


def _detect_message_language(message: str) -> Optional[str]:
    """Real detected language, or None when detection didn't actually run.

    detect_language() returns 'en' unconditionally when LANGUAGE_DETECTION_ENABLED
    is off — that's a safe no-op default for the canned-string layer, not a real
    per-message detection result. Persisting it as if it were a genuine 'en'
    detection would misrepresent a disabled feature as analyzed data, so this
    returns None (-> NULL) whenever detection isn't actually enabled.
    """
    if not settings.LANGUAGE_DETECTION_ENABLED:
        return None
    return detect_language(message)


def _save_chat_history(
    db: Session,
    client: Client,
    project: Optional[Project],
    message: str,
    reply: str,
    ai_result: dict,
    channel: str,
) -> Optional[ChatHistory]:
    if not project:
        return None
    try:
        # On a failed AI turn, the persisted `reply` is a hardcoded apology,
        # not model output — no real model produced it, so model_used is
        # genuinely unknown (NULL), not the "error" sentinel that used to be
        # stored here.
        ai_succeeded = bool(ai_result.get("success"))
        chat_entry = ChatHistory(
            id=uuid.uuid4(),
            client_id=client.id,
            project_id=project.id,
            message=message or "",
            response=reply,
            tokens_used=ai_result.get("tokens_used", 0),
            model_used=ai_result.get("model") if ai_succeeded else None,
            channel=channel,
            language=_detect_message_language(message),
            ai_response_time_ms=ai_result.get("latency_ms"),
            # confidence/sentiment intentionally omitted — no real signal
            # exists to populate them with; they stay NULL via the column
            # default, per the "never fabricate" requirement.
        )
        db.add(chat_entry)
        db.commit()
        db.refresh(chat_entry)
        return chat_entry
    except Exception as exc:
        logger.error(f"Failed to save chat history: {exc}")
        return None


def upsert_conversation_state(
    db: Session,
    client_id: uuid.UUID,
    status: str,
    updated_by_user_id: Optional[uuid.UUID] = None,
) -> ConversationState:
    """Create or update the conversation-state row for a client.

    updated_by_user_id=None means this was set automatically by the AI
    pipeline; a real user id means a human explicitly changed it (see
    PATCH /api/v1/chat/conversations/{client_id}/status in chat.py).
    """
    state = db.query(ConversationState).filter(ConversationState.client_id == client_id).first()
    if state:
        state.status = status
        state.updated_by_user_id = updated_by_user_id
    else:
        state = ConversationState(
            client_id=client_id,
            status=status,
            updated_by_user_id=updated_by_user_id,
        )
        db.add(state)
    db.commit()
    db.refresh(state)
    return state


async def _update_conversation_state_from_ai_result(db: Session, client: Client, ai_result: dict) -> None:
    """Automatic transition after an AI turn — driven by the real ai_result["success"]
    signal, not a fabricated heuristic. A failed AI turn (all providers exhausted, or
    an error) genuinely means a human needs to look at it; a successful one means the
    AI handled this turn. Any prior manual state (resolved/escalated) is intentionally
    overwritten — new client activity means the conversation is active again."""
    try:
        status = "ai_handling" if ai_result.get("success") else "awaiting_human"
        state = upsert_conversation_state(db, client.id, status, updated_by_user_id=None)
        await broadcast_state_changed(client, state)
    except Exception as exc:
        logger.error(f"Failed to update conversation state: {exc}")


async def broadcast_state_changed(client: Client, state: ConversationState) -> None:
    """Broadcast a conversation.state_changed event — fired from both the automatic
    pipeline above and the manual PATCH endpoint in chat.py, so every real state
    transition (automatic or human) reaches the dashboard live."""
    try:
        org_id = str(client.org_id) if client.org_id else None
        await manager.broadcast(
            build_event(
                "conversation.state_changed",
                payload={
                    "client_id": str(client.id),
                    "status": state.status,
                    "updated_by_user_id": str(state.updated_by_user_id) if state.updated_by_user_id else None,
                },
                conversation_id=str(client.id),
                organization_id=org_id,
            ),
            str(client.user_id),
            conversation_id=str(client.id),
        )
    except Exception as exc:
        logger.error(f"WebSocket broadcast (state_changed) failed: {exc}")


async def _broadcast_incoming(client: Client, message: str, channel: str) -> None:
    """Broadcast conversation.message_received — fired immediately on receipt,
    before the AI has processed anything. Gives the dashboard an instant "someone
    is texting" signal; does not carry an AI reply, since none exists yet (see
    _broadcast_completed below for that)."""
    try:
        org_id = str(client.org_id) if client.org_id else None
        await manager.broadcast(
            build_event(
                "conversation.message_received",
                payload={
                    "client_id": str(client.id),
                    "client_name": client.name,
                    "message": message,
                    "channel": channel,
                },
                conversation_id=str(client.id),
                organization_id=org_id,
            ),
            str(client.user_id),
            conversation_id=str(client.id),
        )
    except Exception as exc:
        logger.error(f"WebSocket broadcast (message_received) failed: {exc}")


async def _broadcast_completed(client: Client, chat_entry: Optional[ChatHistory]) -> None:
    """Broadcast conversation.message_completed — fired once the full turn is
    persisted, carrying the real AI reply (or real fallback apology on failure).
    This is the event that fixes the audit finding that the AI's reply never
    reached the dashboard in real time: the old single broadcast fired before
    the reply existed at all."""
    if not chat_entry:
        return
    try:
        org_id = str(client.org_id) if client.org_id else None
        await manager.broadcast(
            build_event(
                "conversation.message_completed",
                payload={
                    "id": str(chat_entry.id),
                    "client_id": str(client.id),
                    "client_name": client.name,
                    "message": chat_entry.message,
                    "response": chat_entry.response,
                    "ai_response": chat_entry.response,
                    "model_used": chat_entry.model_used,
                    "tokens_used": chat_entry.tokens_used,
                    "channel": chat_entry.channel,
                    "confidence": chat_entry.confidence,
                    "sentiment": chat_entry.sentiment,
                    "language": chat_entry.language,
                    "ai_response_time_ms": chat_entry.ai_response_time_ms,
                    "created_at": chat_entry.created_at.isoformat() if chat_entry.created_at else None,
                },
                conversation_id=str(client.id),
                organization_id=org_id,
            ),
            str(client.user_id),
            conversation_id=str(client.id),
        )
    except Exception as exc:
        logger.error(f"WebSocket broadcast (message_completed) failed: {exc}")


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def _maybe_transcribe_voice(
    channel: str,
    message: str,
    media_url: Optional[str],
    media_content_type: Optional[str],
    media_auth: Optional[tuple],
) -> tuple[str, Optional[str]]:
    """Phase 0: if the media is a voice note and transcription is enabled,
    return (message_with_transcript, media_url_for_ai). Audio is consumed into
    text, so it is not also forwarded as an image. Flag-off / non-audio / any
    failure leaves both inputs unchanged."""
    is_audio = bool(media_content_type) and media_content_type.split(";")[0].strip().lower().startswith("audio/")
    if not (settings.VOICE_TRANSCRIPTION_ENABLED and media_url and is_audio):
        return message, media_url

    transcript = await transcribe_audio(media_url, media_content_type, media_auth)
    if not transcript:
        # Transcription failed — drop the (non-image) audio, keep any text body.
        logger.warning("[%s] Voice transcription produced no text", channel.upper())
        return message, None

    combined = f"{message} {transcript}".strip() if message else transcript
    return combined, None


async def process_incoming_message(
    channel: str,
    client: Client,
    message: str,
    media_url: Optional[str] = None,
    media_content_type: Optional[str] = None,
    media_auth: Optional[tuple] = None,
) -> str:
    """
    Core AI pipeline shared by WhatsApp and Telegram.

    Args:
        channel: "whatsapp" or "telegram"
        client: The resolved Client ORM object
        message: Incoming message text
        media_url: Optional media attachment URL
        media_content_type: Optional MIME type of the media (e.g. "audio/ogg")
        media_auth: Optional (user, pass) for fetching the media (Twilio)

    Returns:
        The AI-generated reply string
    """
    start_ts = time.monotonic()
    db = SessionLocal()
    try:
        message, media_url = await _maybe_transcribe_voice(
            channel, message, media_url, media_content_type, media_auth,
        )
        logger.info(
            "[%s] Incoming client=%r msg_len=%d media=%s",
            channel.upper(), client.name, len(message or ""), bool(media_url),
        )
        await _broadcast_incoming(client, message, channel)

        project = _get_client_project(db, client)
        project_name = project.name if project else "your project"
        github_stats = await _get_project_github_stats(project)
        milestones = _serialize_project_milestones(db, project)

        logger.info(
            "[%s] Context: project=%r milestones=%d github=%s",
            channel.upper(), project_name, len(milestones), bool(github_stats),
        )

        # Call AI service — Gemini->OpenAI->Claude auto-fallback built in
        ai_result = await generate_client_response(
            client_name=client.name,
            project_name=project_name,
            github_stats=github_stats,
            milestones=milestones,
            client_question=message or "Hello",
            media_url=media_url,
        )

        reply = ai_result.get("response", "")
        if not reply:
            reply = t("ai_empty", detect_language(message))

        chat_entry = _save_chat_history(db, client, project, message, reply, ai_result, channel)
        await _broadcast_completed(client, chat_entry)
        await _update_conversation_state_from_ai_result(db, client, ai_result)

        elapsed_ms = int((time.monotonic() - start_ts) * 1000)
        logger.info(
            "[%s] Done client=%r provider=%s tokens=%s total=%dms",
            channel.upper(), client.name,
            ai_result.get("provider", "?"), ai_result.get("tokens_used", 0),
            elapsed_ms,
        )
        return reply

    except Exception as e:
        elapsed_ms = int((time.monotonic() - start_ts) * 1000)
        logger.error(
            "[%s] Pipeline error client=%r after %dms: %s",
            channel.upper(), client.name, elapsed_ms, e,
            exc_info=True,
        )
        return t("pipeline_error", detect_language(message))
    finally:
        db.close()
