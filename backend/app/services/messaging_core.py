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
from app.services.ai_service import generate_client_response
from app.services.cache_service import get_github_stats_cached
from app.services.transcription_service import transcribe_audio
from app.websockets.manager import manager

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


def _save_chat_history(
    db: Session,
    client: Client,
    project: Optional[Project],
    message: str,
    reply: str,
    ai_result: dict,
    channel: str,
) -> None:
    if not project:
        return
    try:
        chat_entry = ChatHistory(
            id=uuid.uuid4(),
            client_id=client.id,
            project_id=project.id,
            message=message or "",
            response=reply,
            tokens_used=ai_result.get("tokens_used", 0),
            model_used=ai_result.get("model", "unknown"),
            channel=channel,
        )
        db.add(chat_entry)
        db.commit()
    except Exception as exc:
        logger.error(f"Failed to save chat history: {exc}")


async def _broadcast_incoming(client: Client, message: str, channel: str) -> None:
    """Broadcast incoming message to the tenant's dashboard via WebSocket."""
    try:
        await manager.broadcast(
            {
                "type": "incoming_message",
                "message": {
                    "client_id": str(client.id),
                    "client_name": client.name,
                    "message": message,
                    "channel": channel,
                },
            },
            str(client.user_id),
        )
    except Exception as exc:
        logger.error(f"WebSocket broadcast failed: {exc}")


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
            reply = "Sorry, I couldn't generate a response right now. Please try again. \U0001f64f"

        _save_chat_history(db, client, project, message, reply, ai_result, channel)

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
        return "Sorry, something went wrong. Please try again later or contact support."
    finally:
        db.close()
