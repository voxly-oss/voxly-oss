from app.api.v1.auth import router as auth_router
from app.api.v1.clients import router as clients_router
from app.api.v1.projects import router as projects_router
from app.api.v1.milestones import router as milestones_router
from app.api.v1.chat import router as chat_router
from app.api.v1.whatsapp import router as whatsapp_router
from app.api.v1.api_keys import router as api_keys_router
from app.api.v1.billing import router as billing_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.ai_keys import router as ai_keys_router

__all__ = [
    "auth_router", 
    "clients_router", 
    "projects_router", 
    "milestones_router",
    "chat_router",
    "whatsapp_router",
    "api_keys_router",
    "billing_router",
    "notifications_router",
    "dashboard_router",
    "ai_keys_router",
]
