import resend
import logging
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

if settings.RESEND_API_KEY:
    resend.api_key = settings.RESEND_API_KEY

def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    """Send a password reset email using Resend."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY is not set. Password reset email not sent.")
        return False
        
    try:
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Reset Your Voxly Password</h2>
            <p>You recently requested to reset your password for your Voxly account. Click the button below to reset it. This password reset is only valid for the next 15 minutes.</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_link}" style="background-color: #000000; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
            </div>
            <p>If you have trouble clicking the button, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0066cc;">{reset_link}</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">If you did not request a password reset, please ignore this email or contact support if you have questions.</p>
            <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Voxly — The AI Project Manager</p>
        </div>
        """
        
        from_email = getattr(settings, "RESEND_FROM_EMAIL", "onboarding@resend.dev")
        
        response = resend.Emails.send({
            "from": f"Voxly <{from_email}>",
            "to": [to_email],
            "subject": "Reset Your Voxly Password",
            "html": html_content
        })
        
        logger.info(f"Password reset email dispatched successfully. Resend ID: {response.get('id', 'unknown')}")
        return True
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")
        return False
