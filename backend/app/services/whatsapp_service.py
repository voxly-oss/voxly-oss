from twilio.rest import Client
from app.config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

twilio_client = Client(
    settings.TWILIO_ACCOUNT_SID,
    settings.TWILIO_AUTH_TOKEN
)


async def send_whatsapp_message(to_number: str, message: str) -> bool:
    """
    Send WhatsApp message via Twilio
    
    Args:
        to_number: Phone number in format +919876543210
        message: Message text to send
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Ensure number has whatsapp: prefix
        if not to_number.startswith('whatsapp:'):
            to_number = f'whatsapp:{to_number}'
        
        result = twilio_client.messages.create(
            from_=settings.TWILIO_WHATSAPP_NUMBER,
            to=to_number,
            body=message
        )
        
        # Mask phone number for logging
        masked_number = f"****{to_number[-4:]}" if len(to_number) > 4 else "****"
        logger.info(f"WhatsApp message sent to {masked_number}. SID: {result.sid[:8]}...")
        return True
        
    except Exception as e:
        masked_number = f"****{to_number[-4:]}" if len(to_number) > 4 else "****"
        logger.error(f"Failed to send WhatsApp message to {masked_number}: {e}")
        return False


async def send_whatsapp_with_media(to_number: str, message: str, media_url: str) -> bool:
    """
    Send WhatsApp message with media (image/PDF)
    
    Args:
        to_number: Phone number
        message: Message text
        media_url: Public URL of media file
        
    Returns:
        True if successful
    """
    try:
        if not to_number.startswith('whatsapp:'):
            to_number = f'whatsapp:{to_number}'
        
        result = twilio_client.messages.create(
            from_=settings.TWILIO_WHATSAPP_NUMBER,
            to=to_number,
            body=message,
            media_url=[media_url]
        )
        
        # Mask phone number for logging
        masked_number = f"****{to_number[-4:]}" if len(to_number) > 4 else "****"
        logger.info(f"WhatsApp msg with media sent to {masked_number}. SID: {result.sid[:8]}...")
        return True
        
    except Exception as e:
        masked_number = f"****{to_number[-4:]}" if len(to_number) > 4 else "****"
        logger.error(f"Failed to send WhatsApp with media to {masked_number}: {e}")
        return False
