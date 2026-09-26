"""Outbound WhatsApp, behind one seam so the transport can be swapped.

WHATSAPP_PROVIDER picks the transport:
  - "twilio": Twilio's official WhatsApp API (default, unchanged behaviour)
  - "waha":   a self-hosted WAHA gateway (open source, unofficial WhatsApp Web)

Every caller uses send_whatsapp_message(); none of them know which is active.
"""

import logging
import re

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_twilio_client = None


def _get_twilio_client():
    """Build the Twilio client on first use so a WAHA-only deploy needs no Twilio creds."""
    global _twilio_client
    if _twilio_client is None:
        from twilio.rest import Client

        _twilio_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _twilio_client


def _mask(number: str) -> str:
    return f"****{number[-4:]}" if len(number) > 4 else "****"


def phone_to_waha_chat_id(phone: str) -> str:
    """'+91 97290 41423' or 'whatsapp:+919729041423' -> '919729041423@c.us'."""
    digits = re.sub(r"\D", "", phone.replace("whatsapp:", ""))
    return f"{digits}@c.us"


def waha_chat_id_to_phone(chat_id: str) -> str | None:
    """'919729041423@c.us' -> '+919729041423'. Returns None for groups/@lid/status ids."""
    match = re.fullmatch(r"(\d{6,15})@c\.us", chat_id or "")
    return f"+{match.group(1)}" if match else None


def _waha_headers() -> dict:
    return {"X-Api-Key": settings.WAHA_API_KEY} if settings.WAHA_API_KEY else {}


async def _waha_post(path: str, body: dict) -> None:
    async with httpx.AsyncClient(timeout=20.0) as http:
        resp = await http.post(
            f"{settings.WAHA_URL.rstrip('/')}{path}",
            json={"session": settings.WAHA_SESSION, **body},
            headers=_waha_headers(),
        )
        resp.raise_for_status()


async def send_whatsapp_message(to_number: str, message: str) -> bool:
    """
    Send a WhatsApp text message via the configured provider.

    Args:
        to_number: Phone number in format +919876543210
        message: Message text to send

    Returns:
        True if successful, False otherwise
    """
    try:
        if settings.WHATSAPP_PROVIDER == "waha":
            await _waha_post(
                "/api/sendText",
                {"chatId": phone_to_waha_chat_id(to_number), "text": message},
            )
            logger.info(f"WhatsApp (waha) message sent to {_mask(to_number)}")
            return True

        if not to_number.startswith("whatsapp:"):
            to_number = f"whatsapp:{to_number}"
        result = _get_twilio_client().messages.create(
            from_=settings.TWILIO_WHATSAPP_NUMBER,
            to=to_number,
            body=message,
        )
        logger.info(f"WhatsApp message sent to {_mask(to_number)}. SID: {result.sid[:8]}...")
        return True

    except Exception as e:
        logger.error(f"Failed to send WhatsApp message to {_mask(to_number)}: {e}")
        return False


async def send_whatsapp_with_media(to_number: str, message: str, media_url: str) -> bool:
    """
    Send WhatsApp message with an image by public URL.

    Returns:
        True if successful
    """
    try:
        if settings.WHATSAPP_PROVIDER == "waha":
            await _waha_post(
                "/api/sendImage",
                {
                    "chatId": phone_to_waha_chat_id(to_number),
                    "file": {"url": media_url},
                    "caption": message,
                },
            )
            logger.info(f"WhatsApp (waha) media sent to {_mask(to_number)}")
            return True

        if not to_number.startswith("whatsapp:"):
            to_number = f"whatsapp:{to_number}"
        result = _get_twilio_client().messages.create(
            from_=settings.TWILIO_WHATSAPP_NUMBER,
            to=to_number,
            body=message,
            media_url=[media_url],
        )
        logger.info(f"WhatsApp msg with media sent to {_mask(to_number)}. SID: {result.sid[:8]}...")
        return True

    except Exception as e:
        logger.error(f"Failed to send WhatsApp with media to {_mask(to_number)}: {e}")
        return False
