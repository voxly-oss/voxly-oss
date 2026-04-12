"""
Telegram Service — Send messages via the Telegram Bot API.

Uses httpx async — no extra dependencies needed (already in requirements).
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.telegram.org"


def _bot_url(method: str) -> str:
    return f"{_BASE_URL}/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"


async def send_telegram_message(chat_id: str | int, text: str) -> bool:
    """
    Send a plain text message to a Telegram chat.

    Args:
        chat_id: Telegram chat ID (numeric string or int)
        text: Message text (Markdown supported)

    Returns:
        True if sent successfully
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _bot_url("sendMessage"),
                json={
                    "chat_id": str(chat_id),
                    "text": text,
                    "parse_mode": "Markdown",
                },
            )
            if resp.status_code == 200:
                logger.info(f"Telegram message sent to chat {str(chat_id)[:4]}***")
                return True
            else:
                logger.error(f"Telegram API error {resp.status_code}: {resp.text[:200]}")
                return False
    except Exception as e:
        logger.error(f"Failed to send Telegram message: {e}")
        return False


async def send_telegram_photo(chat_id: str | int, photo_url: str, caption: str = "") -> bool:
    """Send a photo via URL to a Telegram chat."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _bot_url("sendPhoto"),
                json={
                    "chat_id": str(chat_id),
                    "photo": photo_url,
                    "caption": caption,
                    "parse_mode": "Markdown",
                },
            )
            return resp.status_code == 200
    except Exception as e:
        logger.error(f"Failed to send Telegram photo: {e}")
        return False


async def set_webhook(webhook_url: str, secret_token: str = "") -> bool:
    """
    Register the Telegram webhook URL. Call once after deployment.

    Args:
        webhook_url: Full HTTPS URL (e.g. https://backend.run.app/api/v1/telegram/webhook)
        secret_token: Random string Telegram sends in X-Telegram-Bot-Api-Secret-Token header
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            payload = {"url": webhook_url}
            if secret_token:
                payload["secret_token"] = secret_token
            resp = await client.post(_bot_url("setWebhook"), json=payload)
            result = resp.json()
            if result.get("ok"):
                logger.info(f"Telegram webhook registered: {webhook_url}")
                return True
            else:
                logger.error(f"Telegram webhook registration failed: {result}")
                return False
    except Exception as e:
        logger.error(f"Failed to set Telegram webhook: {e}")
        return False
