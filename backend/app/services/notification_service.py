"""
Event-Driven Notification Service

Sends WhatsApp messages to clients when events happen in the dashboard:
- Client created → welcome message
- Project created → project started notification
- Milestone completed → progress update
- Project completed → completion celebration
- Manual follow-up → custom message
"""
import logging
from typing import Optional
from sqlalchemy.orm import Session

from app.services.whatsapp_service import send_whatsapp_message
from app.models.user import User

logger = logging.getLogger(__name__)


# Message templates with placeholder support
TEMPLATES = {
    "client_welcome": (
        "👋 Hi {client_name}! You've been added to {agency_name}'s project tracker. "
        "Text me anytime to check your project status! 🚀"
    ),
    "project_started": (
        "🚀 Hi {client_name}! Great news — your project '{project_name}' has kicked off! "
        "You can text me anytime to ask about progress. Let's build something amazing! 💪"
    ),
    "milestone_completed": (
        "✅ Great news {client_name}! '{milestone_title}' on your project '{project_name}' "
        "is now complete! Overall progress: {progress}%. "
        "Keep the questions coming! 🎯"
    ),
    "project_completed": (
        "🎉 {client_name}, your project '{project_name}' is now complete! "
        "Thank you for trusting {agency_name} with this project. "
        "We'd love to work with you again! 🙏"
    ),
}


async def send_notification(
    phone: str,
    template_name: str,
    context: dict,
    db: Optional[Session] = None
) -> bool:
    """
    Send a templated notification via WhatsApp.
    
    Args:
        phone: Client's phone number
        template_name: Key from TEMPLATES dict
        context: Dict with placeholder values
        db: Optional DB session for logging
    
    Returns:
        True if sent successfully
    """
    template = TEMPLATES.get(template_name)
    if not template:
        logger.error(f"Unknown notification template: {template_name}")
        return False
    
    try:
        message = template.format(**context)
    except KeyError as e:
        logger.error(f"Missing template variable {e} for {template_name}")
        return False
    
    success = await send_whatsapp_message(phone, message)
    
    if success:
        logger.info(f"Notification sent: {template_name} → {phone}")
    else:
        logger.error(f"Failed to send notification: {template_name} → {phone}")
    
    return success


async def send_custom_message(phone: str, message: str) -> bool:
    """Send a custom follow-up message (agency-typed)."""
    success = await send_whatsapp_message(phone, message)
    
    if success:
        logger.info(f"Custom message sent → {phone}")
    else:
        logger.error(f"Failed to send custom message → {phone}")
    
    return success


# --- Event Hooks (called from API routes as background tasks) ---

async def on_client_created(client_name: str, client_phone: str, agency_name: str):
    """Hook: called when a new client is added."""
    await send_notification(
        phone=client_phone,
        template_name="client_welcome",
        context={
            "client_name": client_name,
            "agency_name": agency_name or "your agency"
        }
    )


async def on_project_created(client_name: str, client_phone: str, project_name: str):
    """Hook: called when a project is created for a client."""
    await send_notification(
        phone=client_phone,
        template_name="project_started",
        context={
            "client_name": client_name,
            "project_name": project_name
        }
    )


async def on_milestone_completed(
    client_name: str,
    client_phone: str,
    project_name: str,
    milestone_title: str,
    progress: int
):
    """Hook: called when a milestone is marked as completed."""
    await send_notification(
        phone=client_phone,
        template_name="milestone_completed",
        context={
            "client_name": client_name,
            "project_name": project_name,
            "milestone_title": milestone_title,
            "progress": progress
        }
    )


async def on_project_completed(
    client_name: str,
    client_phone: str,
    project_name: str,
    agency_name: str
):
    """Hook: called when a project status changes to 'completed'."""
    await send_notification(
        phone=client_phone,
        template_name="project_completed",
        context={
            "client_name": client_name,
            "project_name": project_name,
            "agency_name": agency_name or "your agency"
        }
    )
