from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from app.services.whatsapp_service import send_whatsapp_message
from app.database import SessionLocal
from app.models.client import Client
from app.models.project import Project
from app.models.milestone import Milestone
from app.models.chat_history import ChatHistory
from app.services.ai_service import generate_client_response
from app.services.cache_service import get_github_stats_cached
from app.websockets.manager import manager
from app.config import settings
from twilio.request_validator import RequestValidator
import logging
import uuid

logger = logging.getLogger(__name__)
router = APIRouter()


def _build_twilio_validation_url(request: Request) -> str:
    """Build webhook URL exactly as Twilio signed it, accounting for reverse proxies."""
    forwarded_proto = request.headers.get("x-forwarded-proto")
    forwarded_host = request.headers.get("x-forwarded-host")
    url = str(request.url)

    if forwarded_proto:
        url = url.replace(f"{request.url.scheme}://", f"{forwarded_proto}://", 1)
    if forwarded_host:
        current_host = request.headers.get("host")
        if current_host:
            url = url.replace(current_host, forwarded_host, 1)
    return url


async def _broadcast_incoming_message(client: Client, message: str) -> None:
    try:
        await manager.broadcast(
            {
                "type": "incoming_message",
                "message": {
                    "client_id": str(client.id),
                    "client_name": client.name,
                    "message": message,
                },
            },
            str(client.user_id),
        )
    except Exception as exc:
        logger.error(f"WebSocket broadcast failed: {exc}")


def _get_client_project(db, client: Client) -> Project | None:
    project = (
        db.query(Project)
        .filter(Project.client_id == client.id, Project.status == "active")
        .first()
    )
    if project:
        return project
    return db.query(Project).filter(Project.client_id == client.id).first()


async def _get_project_github_stats(project: Project | None) -> dict:
    if not project or not project.github_repo:
        return {}
    try:
        return await get_github_stats_cached(str(project.id), project.github_repo)
    except Exception:
        return {}


def _serialize_project_milestones(db, project: Project | None) -> list[dict]:
    if not project:
        return []
    ms_rows = db.query(Milestone).filter(Milestone.project_id == project.id).all()
    return [
        {
            "title": milestone.title,
            "status": milestone.status,
            "progress": getattr(milestone, "progress", 0),
            "due_date": (
                str(milestone.due_date) if getattr(milestone, "due_date", None) else None
            ),
        }
        for milestone in ms_rows
    ]


def _save_chat_history(
    db,
    client: Client,
    project: Project | None,
    message: str,
    reply: str,
    ai_result: dict,
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
            ai_model=ai_result.get("model", "unknown"),
            channel="whatsapp",
        )
        db.add(chat_entry)
        db.commit()
    except Exception as exc:
        logger.error(f"Failed to save chat history: {exc}")


@router.post(
    "/webhook",
    responses={
        401: {"description": "Missing or invalid Twilio signature"},
        500: {"description": "Webhook processing failed"},
        503: {"description": "Twilio is not configured"},
    },
)
async def whatsapp_webhook(*, 
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Receive incoming WhatsApp messages from Twilio.

    Twilio sends form data with fields:
    - From: whatsapp:+919876543210
    - Body: The message text
    - MessageSid: Unique message ID
    """
    try:
        form_data = await request.form()
        signature = request.headers.get("X-Twilio-Signature")
        if not signature:
            raise HTTPException(status_code=401, detail="Missing Twilio signature")
        if not settings.TWILIO_AUTH_TOKEN:
            raise HTTPException(status_code=503, detail="Twilio is not configured")

        validator = RequestValidator(settings.TWILIO_AUTH_TOKEN)
        params = {k: v for k, v in form_data.multi_items()}
        valid = validator.validate(_build_twilio_validation_url(request), params, signature)
        if not valid:
            raise HTTPException(status_code=401, detail="Invalid Twilio signature")

        # Extract data — do NOT log phone/body directly (PII)
        from_number = form_data.get("From", "").replace("whatsapp:", "")
        message_body = form_data.get("Body", "")
        message_sid = form_data.get("MessageSid", "")
        media_url = form_data.get("MediaUrl0", None)

        logger.info(f"Received WhatsApp message. Media present: {bool(media_url)}")

        if not from_number or (not message_body and not media_url):
            logger.warning("Invalid webhook data received — missing phone or body")
            return {"status": "ignored", "reason": "missing_data"}

        # Process in background
        background_tasks.add_task(
            process_whatsapp_message,
            from_number,
            message_body,
            message_sid,
            media_url
        )

        return {"status": "processing"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook processing error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Webhook processing failed")


async def process_whatsapp_message(
    phone: str,
    message: str,
    message_sid: str,
    media_url: str = None
):
    """
    Background task: process incoming WhatsApp message and send AI reply.

    Calls the AI service directly — does NOT go through handle_chat HTTP route,
    which would crash slowapi (no real starlette Request in background task).
    """
    db = SessionLocal()
    try:
        # Look up client by phone number
        client = db.query(Client).filter(Client.phone == phone).first()
        if not client:
            logger.warning("No client found for incoming WhatsApp message")
            await send_whatsapp_message(
                phone,
                "Sorry, I don't recognise your number. Please contact your project manager. 🙏"
            )
            return

        await _broadcast_incoming_message(client, message)
        project = _get_client_project(db, client)
        project_name = project.name if project else "your project"
        github_stats = await _get_project_github_stats(project)
        milestones = _serialize_project_milestones(db, project)

        # Call AI service directly (no HTTP, no rate limiter)
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
            reply = "Sorry, I couldn't generate a response right now. Please try again. 🙏"

        _save_chat_history(db, client, project, message, reply, ai_result)

        # Send WhatsApp reply
        success = await send_whatsapp_message(to_number=phone, message=reply)
        if success:
            logger.info(f"Reply sent for message {message_sid}")
        else:
            logger.error(f"Failed to send reply for message {message_sid}")

    except Exception as e:
        logger.error(f"Unexpected error processing WhatsApp message: {e}", exc_info=True)
        try:
            await send_whatsapp_message(
                phone,
                "Sorry, something went wrong. Please try again later or contact support."
            )
        except Exception:
            pass
    finally:
        db.close()


@router.get("/webhook")
async def verify_webhook(*, request: Request):
    """Twilio webhook verification endpoint."""
    return {"status": "active", "message": "WhatsApp webhook is ready"}
