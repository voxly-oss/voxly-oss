import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Invitation(Base):
    """A pending invite for an email address to join an Organization.

    Kept separate from Membership because an invitee may not have a User
    account yet (Membership.user_id is NOT NULL and can't represent that).
    On acceptance, the app creates the real Membership row and marks this
    invitation "accepted". Re-inviting the same (org_id, email) should update
    the existing row (new token/expiry, status back to "pending") rather
    than insert a duplicate, per the uq_invitations_org_email constraint.
    """

    __tablename__ = "invitations"
    __table_args__ = (
        UniqueConstraint("org_id", "email", name="uq_invitations_org_email"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False, index=True)
    invited_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    status = Column(String(20), default="pending", nullable=False)  # pending | accepted | revoked | expired
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship("Organization")
    role = relationship("Role")
    invited_by = relationship("User", foreign_keys=[invited_by_user_id])

    def __repr__(self):
        return f"<Invitation {self.email} -> org={self.org_id}>"
