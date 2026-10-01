import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class ClientChatLink(Base):
    """A client's personal Voxly chat link (the native channel).

    The link token is never stored: it is this row's id plus an HMAC over it
    (services/portal_auth.py), so the agency can copy the same link again
    while nothing secret sits in the database. Revoking — or regenerating,
    which revokes the old row — ends every session opened from the link.
    """

    __tablename__ = "client_chat_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    # So the agency can see the link is in use (and spot a forwarded one).
    last_opened_at = Column(DateTime, nullable=True)
    last_opened_device = Column(String(120), nullable=True)

    __table_args__ = (
        Index("ix_client_chat_links_client_id", "client_id"),
    )

    @property
    def active(self) -> bool:
        return self.revoked_at is None

    def __repr__(self):
        return f"<ClientChatLink {self.client_id} {'active' if self.active else 'revoked'}>"
