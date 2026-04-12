"""
Telegram Webhook API — Receives incoming messages from the Telegram Bot API.

Telegram sends updates as JSON POST requests. The webhook is secured via
the X-Telegram-Bot-Api-Secret-Token header, which must match TELEGRAM_WEBHOOK_SECRET.

Flow:
  1. /start → replies with chat ID instructions
  2. Regular message → look up client by telegram_chat_id → messaging_core pipeline
  3. Unknown chat_id → friendly "not linked" message
"""
import logging

from fastapi import APIRouter, Request, BackgroundTasks, HTTPException

from app.config import settings
from app.database import SessionLocal
from app.services.telegram_service import send_telegram_message
from app.services.messaging_core import find_client_by_telegram, process_incoming_message

logger = logging.getLogger(__name__)
router = APIRouter()


def _validate_telegram_secret(request: Request) -> None:
    """Verify X-Telegram-Bot-Api-Secret-Token header."""
    if not settings.TELEGRAM_WEBHOOK_SECRET:
        return  # No secret configured — skip validation (dev mode)
    token = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if token != settings.TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid Telegram webhook token")


@router.post("/webhook")
async def telegram_webhook(*, request: Request, background_tasks: BackgroundTasks):
    """
    Receive incoming Telegram Bot API updates.

    Telegram sends a JSON body with structure:
      { "update_id": 123, "message": { "chat": { "id": 456 }, "text": "hello" } }
    """
    _validate_telegram_secret(request)

    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Telegram bot is not configured")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    message = body.get("message")
    if not message:
        # Could be an edit, callback_query, etc — ignore gracefully
        return {"status": "ignored", "reason": "no_message"}

    chat = message.get("chat", {})
    chat_id = str(chat.get("id", ""))
    text = message.get("text", "")
    # Telegram file photos — fetch the largest
    photo_list = message.get("photo")
    photo_file_id = photo_list[-1]["file_id"] if photo_list else None

    if not chat_id:
        return {"status": "ignored", "reason": "no_chat_id"}

    # Handle /start command — send linking instructions
    if text.strip().lower() == "/start":
        background_tasks.add_task(
            send_telegram_message,
            chat_id,
            (
                "👋 *Welcome to Voxly!*\n\n"
                f"Your Telegram Chat ID is:\n`{chat_id}`\n\n"
                "Share this with your project manager so they can link "
                "your Telegram account in the Voxly dashboard.\n\n"
                "Once linked, you can message here to get project updates! 🚀"
            ),
        )
        return {"status": "start_handled"}

    # Process in background
    background_tasks.add_task(
        _process_telegram_message,
        chat_id,
        text,
        photo_file_id,
    )

    return {"status": "processing"}


async def _process_telegram_message(
    chat_id: str,
    text: str,
    photo_file_id: str = None,
):
    """Background task: process incoming Telegram message and send AI reply."""
    db = SessionLocal()
    try:
        client = find_client_by_telegram(db, chat_id)
        if not client:
            await send_telegram_message(
                chat_id,
                (
                    "Sorry, your Telegram account isn't linked to any client yet.\n\n"
                    f"Your Chat ID is: `{chat_id}`\n"
                    "Please share this with your project manager. 🙏"
                ),
            )
            return

        # Resolve photo to a URL if present
        media_url = None
        if photo_file_id:
            media_url = await _get_telegram_file_url(photo_file_id)

        reply = await process_incoming_message(
            channel="telegram",
            client=client,
            message=text or "Hello",
            media_url=media_url,
        )

        await send_telegram_message(chat_id, reply)
        logger.info(f"Telegram reply sent to chat {chat_id[:4]}***")

    except Exception as e:
        logger.error(f"Error processing Telegram message: {e}", exc_info=True)
        try:
            await send_telegram_message(
                chat_id,
                "Sorry, something went wrong. Please try again later.",
            )
        except Exception:
            pass
    finally:
        db.close()


async def _get_telegram_file_url(file_id: str) -> str | None:
    """Resolve a Telegram file_id to a downloadable URL."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/getFile",
                params={"file_id": file_id},
            )
            data = resp.json()
            if data.get("ok"):
                file_path = data["result"]["file_path"]
                return f"https://api.telegram.org/file/bot{settings.TELEGRAM_BOT_TOKEN}/{file_path}"
    except Exception as e:
        logger.error(f"Failed to resolve Telegram file: {e}")
    return None


@router.get("/webhook")
async def telegram_webhook_health():
    """Health check for the Telegram webhook."""
    return {"status": "active", "message": "Telegram webhook is ready"}
