from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class ChannelActivityResponse(BaseModel):
    """Real per-client, per-channel activity aggregated from chat_history.

    Read-only — there is no ChannelCreate/ChannelUpdate, this is not an
    owned resource. Only channels that actually appear in chat_history
    are returned; chat_history.channel is constrained to "whatsapp" and
    "telegram" today, so this endpoint never returns an "email" row —
    email is a one-way notification/reset channel (email_service.py,
    Resend) with no persisted conversation history to aggregate.
    """
    client_id: UUID
    channel: str
    volume_today: int
    last_activity: Optional[datetime] = None
