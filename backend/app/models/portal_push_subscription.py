import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class PortalPushSubscription(Base):
    """One device that asked for notifications on a client's Voxly chat.

    Tied to the chat link the device signed in through: regenerating or
    turning off the link deletes these rows, so a cut-off device stops
    getting notified. `endpoint` is the push service URL the browser gave us
    (it identifies the device); p256dh/auth are its payload encryption keys.
    """

    __tablename__ = "portal_push_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    link_id = Column(UUID(as_uuid=True), ForeignKey("client_chat_links.id", ondelete="CASCADE"), nullable=False)
    endpoint = Column(String(1024), nullable=False, unique=True)
    p256dh = Column(String(128), nullable=False)
    auth = Column(String(64), nullable=False)
    device = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_portal_push_subscriptions_client_id", "client_id"),
    )

    def __repr__(self):
        return f"<PortalPushSubscription {self.client_id} {self.device or ''}>"
