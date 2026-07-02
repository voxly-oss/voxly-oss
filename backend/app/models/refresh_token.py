import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class RefreshToken(Base):
    """Opaque, rotating refresh tokens for long-lived sessions.

    Only the SHA-256 hash of the token is stored (never the plaintext). On use,
    a token is rotated: the old row is revoked and a new one issued, so a stolen
    token is single-use and detectable.
    """

    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<RefreshToken user={self.user_id} revoked={self.revoked_at is not None}>"
