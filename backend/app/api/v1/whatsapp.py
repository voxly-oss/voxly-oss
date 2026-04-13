"""
WhatsApp Webhook API — Receives incoming messages from Twilio.

Refactored to use the shared messaging_core pipeline.
All business logic (AI, history, broadcast) is in messaging_core.py.
"""
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from app.services.whatsapp_service import send_whatsapp_message
from app.services.messaging_core import find_client_by_phone, process_incoming_message
from app.database import SessionLocal
from app.config import settings
from twilio.request_validator import RequestValidator
import logging

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
            _process_whatsapp_message,
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


async def _process_whatsapp_message(
    phone: str,
    message: str,
    message_sid: str,
    media_url: str = None
):
    """
    Background task: process incoming WhatsApp message via shared messaging_core.
    """
    db = SessionLocal()
    try:
        client = find_client_by_phone(db, phone)
        if not client:
            logger.warning("No client found for incoming WhatsApp message")
            await send_whatsapp_message(
                phone,
                "Sorry, I don't recognise your number. Please contact your project manager. 🙏"
            )
            return

        reply = await process_incoming_message(
            channel="whatsapp",
            client=client,
            message=message,
            media_url=media_url,
        )

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
