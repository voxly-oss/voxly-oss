"""Tests for Phase 1 Milestone 1: Organization / Role / Membership schema expand.

These tables and columns are additive and inert in this milestone — nothing
in the application reads or writes them yet. Tests verify the new schema is
sound (model creation, relationships, uniqueness) and that existing
register/login/client flows are completely unaffected by the new nullable
org_id columns.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from datetime import datetime, timedelta

from app.models.user import User
from app.models.client import Client
from app.models.organization import Organization
from app.models.role import Role
from app.models.membership import Membership
from app.models.invitation import Invitation


# ── Helpers ──────────────────────────────────────────────────────────


def _make_user(db_session, email="owner@example.com") -> User:
    user = User(email=email, password_hash="hashed", full_name="Owner", agency_name="Acme")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _make_role(db_session, name="owner", permissions=None) -> Role:
    role = Role(name=name, permissions=permissions or ["org:admin"])
    db_session.add(role)
    db_session.commit()
    db_session.refresh(role)
    return role


def _make_org(db_session, owner: User, name="Acme Agency", slug="acme-agency") -> Organization:
    org = Organization(name=name, slug=slug, owner_user_id=owner.id)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


# ── Model creation ───────────────────────────────────────────────────


def test_create_organization(db_session):
    """An Organization can be created with an owning user."""
    owner = _make_user(db_session)
    org = _make_org(db_session, owner)

    assert org.id is not None
    assert org.owner_user_id == owner.id
    assert org.billing_region == "INTL"
    assert org.is_active is True


def test_create_role_with_permissions(db_session):
    """A Role stores a permissions list."""
    role = _make_role(db_session, name="admin", permissions=["client:read", "client:write"])

    assert role.name == "admin"
    assert "client:write" in role.permissions
    assert role.is_system is True


def test_create_membership_links_user_org_role(db_session):
    """A Membership joins a user to an org under a role."""
    owner = _make_user(db_session)
    org = _make_org(db_session, owner)
    role = _make_role(db_session)

    membership = Membership(org_id=org.id, user_id=owner.id, role_id=role.id)
    db_session.add(membership)
    db_session.commit()
    db_session.refresh(membership)

    assert membership.status == "active"
    assert membership.organization.id == org.id
    assert membership.user.id == owner.id
    assert membership.role.id == role.id


def test_membership_unique_org_user(db_session):
    """The same user cannot have two memberships in the same org."""
    owner = _make_user(db_session)
    org = _make_org(db_session, owner)
    role = _make_role(db_session)

    db_session.add(Membership(org_id=org.id, user_id=owner.id, role_id=role.id))
    db_session.commit()

    db_session.add(Membership(org_id=org.id, user_id=owner.id, role_id=role.id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_organization_slug_unique(db_session):
    """Organization slugs must be globally unique."""
    owner = _make_user(db_session)
    _make_org(db_session, owner, slug="dup-slug")

    db_session.add(Organization(name="Other", slug="dup-slug", owner_user_id=owner.id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# ── Role scoping: system roles vs org-scoped custom roles ───────────


def test_two_system_roles_cannot_share_a_name(db_session):
    """Two roles with org_id=NULL (system roles) can't share a name -- the
    partial unique index (not a plain unique(org_id, name)) is what catches
    this, since Postgres/SQLite treat NULL != NULL in composite constraints."""
    db_session.add(Role(name="owner", org_id=None, permissions=["org:admin"]))
    db_session.commit()

    db_session.add(Role(name="owner", org_id=None, permissions=["org:admin"]))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_two_different_orgs_can_reuse_a_custom_role_name(db_session):
    """Two different orgs may each define a custom role with the same name."""
    owner1 = _make_user(db_session, email="owner1@example.com")
    owner2 = _make_user(db_session, email="owner2@example.com")
    org1 = _make_org(db_session, owner1, name="Org One", slug="org-one")
    org2 = _make_org(db_session, owner2, name="Org Two", slug="org-two")

    db_session.add(Role(name="Support Rep", org_id=org1.id, permissions=["client:read"], is_system=False))
    db_session.add(Role(name="Support Rep", org_id=org2.id, permissions=["client:read"], is_system=False))
    db_session.commit()  # must not raise


def test_same_org_cannot_reuse_a_custom_role_name(db_session):
    """Within a single org, custom role names must be unique."""
    owner = _make_user(db_session)
    org = _make_org(db_session, owner)

    db_session.add(Role(name="Support Rep", org_id=org.id, permissions=["client:read"], is_system=False))
    db_session.commit()

    db_session.add(Role(name="Support Rep", org_id=org.id, permissions=["client:read"], is_system=False))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_custom_role_can_share_name_with_a_system_role(db_session):
    """A custom role (org_id set) and a system role (org_id NULL) with the
    same name don't collide -- they live in different partial indexes."""
    owner = _make_user(db_session)
    org = _make_org(db_session, owner)

    db_session.add(Role(name="viewer", org_id=None, permissions=["client:read"]))
    db_session.add(Role(name="viewer", org_id=org.id, permissions=["client:read"], is_system=False))
    db_session.commit()  # must not raise


# ── Invitations: invite-by-email before a User account exists ───────


def test_create_invitation(db_session):
    """An invitation can be created for an email with no User account yet."""
    owner = _make_user(db_session)
    org = _make_org(db_session, owner)
    role = _make_role(db_session, name="member")

    invite = Invitation(
        org_id=org.id,
        email="new-teammate@example.com",
        role_id=role.id,
        invited_by_user_id=owner.id,
        token=str(uuid.uuid4()),
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db_session.add(invite)
    db_session.commit()
    db_session.refresh(invite)

    assert invite.status == "pending"
    assert invite.organization.id == org.id
    assert invite.role.id == role.id
    assert invite.invited_by.id == owner.id


def test_invitation_unique_per_org_email(db_session):
    """The same email can't have two pending invitations to the same org."""
    owner = _make_user(db_session)
    org = _make_org(db_session, owner)
    role = _make_role(db_session, name="member")

    def _invite():
        return Invitation(
            org_id=org.id,
            email="dup-invite@example.com",
            role_id=role.id,
            invited_by_user_id=owner.id,
            token=str(uuid.uuid4()),
            expires_at=datetime.utcnow() + timedelta(days=7),
        )

    db_session.add(_invite())
    db_session.commit()

    db_session.add(_invite())
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# ── org_id columns are nullable and inert on existing tables ────────


def test_client_can_be_created_without_org_id(db_session):
    """Existing Client creation path (no org_id) keeps working unchanged."""
    owner = _make_user(db_session)
    c = Client(user_id=owner.id, name="Test Client", phone="+919999900001")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)

    assert c.org_id is None


def test_client_can_be_created_with_org_id(db_session):
    """org_id can optionally be set once populated (future milestone)."""
    owner = _make_user(db_session)
    org = _make_org(db_session, owner)
    c = Client(user_id=owner.id, org_id=org.id, name="Test Client 2", phone="+919999900002")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)

    assert c.org_id == org.id


# ── Existing app flows unaffected (register/login/create-client) ────


def test_register_login_and_create_client_unaffected(client: TestClient):
    """The full existing register -> login -> create-client flow is unchanged
    by the new inert organizations/roles/memberships schema."""
    email = f"regress-{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Test1234",
        "full_name": "Regression User",
        "agency_name": "Regression Agency",
    })
    assert reg.status_code in (200, 201)

    login = client.post("/api/v1/auth/login", data={
        "username": email,
        "password": "Test1234",
    })
    assert login.status_code == 200
    token = login.json()["access_token"]

    resp = client.post(
        "/api/v1/clients",
        json={"name": "Regression Client", "phone": "+919999900099", "email": "rc@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code in (200, 201)
    assert resp.json()["name"] == "Regression Client"
