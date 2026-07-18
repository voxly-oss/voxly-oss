import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class Role(Base):
    """System roles (org_id=NULL, shared platform-wide) and org-scoped custom
    roles (org_id set), used by memberships/invitations for RBAC.

    Name uniqueness is enforced via two partial unique indexes rather than a
    single unique(org_id, name) constraint: Postgres treats NULL != NULL in
    unique constraints, so a plain unique(org_id, name) would NOT prevent two
    system roles (org_id=NULL) from sharing a name. The partial indexes below
    enforce "system role names unique among system roles" and "custom role
    names unique within an org" as two separate, correctly-scoped rules.
    """

    __tablename__ = "roles"
    __table_args__ = (
        Index(
            "uq_roles_system_name", "name", unique=True,
            postgresql_where=text("org_id IS NULL"),
            sqlite_where=text("org_id IS NULL"),
        ),
        Index(
            "uq_roles_org_name", "org_id", "name", unique=True,
            postgresql_where=text("org_id IS NOT NULL"),
            sqlite_where=text("org_id IS NOT NULL"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=True, index=True)
    name = Column(String(50), nullable=False, index=True)  # "owner", "admin", "member", "billing", "viewer", or a custom name
    permissions = Column(JSON, default=list, nullable=False)  # ["org:admin", "client:write", ...]
    is_system = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship("Organization")
    memberships = relationship("Membership", back_populates="role")

    def __repr__(self):
        return f"<Role {self.name}>"
