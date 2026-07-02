import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class ProcessedMessage(Base):
    """Idempotency ledger for inbound webhook messages.

    Providers (Twilio, Telegram) retry deliveries, so we record every handled
    message id and skip duplicates — preventing double AI replies and double
    token spend. Rows can be pruned on a retention schedule.
    """

    __tablename__ = "processed_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # e.g. "whatsapp:SMxxxx" or "telegram:123456" — namespaced per channel
    provider_message_id = Column(String(255), unique=True, nullable=False, index=True)
    channel = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<ProcessedMessage {self.provider_message_id}>"
