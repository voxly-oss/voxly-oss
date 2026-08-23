"""Phase 1 Milestone 1: add organizations, roles, memberships, invitations (schema expand only)

Introduces the Organization/Role/Membership/Invitation tables and adds
nullable org_id columns to every table that currently carries a user_id
(clients, subscriptions, api_keys, usage_logs, user_ai_keys). This is a pure
schema expansion: no existing column/constraint/index is touched, no data is
migrated, and no application code reads these columns yet. Safe to deploy
and safe to roll back at any time.

Amended after design review (before this revision was ever applied to any
database) to fix two gaps that would have been expensive to retrofit later:

  - Role.name is scoped via two partial unique indexes instead of a single
    global unique(name): a plain unique(org_id, name) would NOT stop two
    system roles (org_id=NULL) from sharing a name, since Postgres treats
    NULL != NULL in unique constraints. The partial indexes enforce "system
    role names unique among themselves" and "custom role names unique per
    org" as two separate, correctly-scoped rules -- unblocking org-scoped
    custom roles (an Enterprise RBAC requirement) without ever touching
    memberships.role_id after it has real data pointing at it.
  - Added the `invitations` table so "invite a teammate by email who hasn't
    signed up yet" is representable. memberships.user_id is NOT NULL, so it
    cannot itself model a pending invite without a shadow-user anti-pattern.

Revision ID: c1f7825d5a5d
Revises: a1b2c3d4e5f6
Create Date: 2026-07-17

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'c1f7825d5a5d'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None

USERS_ID_FK = "users.id"
ORGANIZATIONS_ID_FK = "organizations.id"
ROLES_ID_FK = "roles.id"

# Tables that currently carry user_id and get a parallel nullable org_id.
ORG_ID_TARGETS = ["clients", "subscriptions", "api_keys", "usage_logs", "user_ai_keys"]

SYSTEM_ROLES = [
    {
        "name": "owner",
        "permissions": [
            "org:admin", "client:read", "client:write", "client:delete",
            "project:read", "project:write", "project:delete",
            "member:invite", "member:remove", "billing:manage",
            "integration:connect", "ai_key:manage",
        ],
    },
    {
        "name": "admin",
        "permissions": [
            "client:read", "client:write", "client:delete",
            "project:read", "project:write", "project:delete",
            "member:invite", "integration:connect", "ai_key:manage",
        ],
    },
    {
        "name": "member",
        "permissions": ["client:read", "client:write", "project:read", "project:write"],
    },
    {
        "name": "billing",
        "permissions": ["billing:manage", "client:read", "project:read"],
    },
    {
        "name": "viewer",
        "permissions": ["client:read", "project:read"],
    },
]


def upgrade():
    # --- Organizations table (created first: roles/memberships/invitations reference it) ---
    op.create_table(
        'organizations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False, unique=True),
        sa.Column('owner_user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey(USERS_ID_FK, ondelete='RESTRICT'), nullable=False),
        sa.Column('billing_region', sa.String(10), server_default='INTL', nullable=False),
        sa.Column('is_active', sa.Boolean, server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_organizations_slug', 'organizations', ['slug'])
    op.create_index('ix_organizations_owner_user_id', 'organizations', ['owner_user_id'])

    # --- Roles table ---
    op.create_table(
        'roles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('org_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey(ORGANIZATIONS_ID_FK, ondelete='RESTRICT'), nullable=True),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('permissions', postgresql.JSON, server_default='[]', nullable=False),
        sa.Column('is_system', sa.Boolean, server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_roles_org_id', 'roles', ['org_id'])
    op.create_index('ix_roles_name', 'roles', ['name'])
    # Partial unique indexes: system role names unique among themselves
    # (org_id IS NULL), custom role names unique within their owning org
    # (org_id IS NOT NULL). NOT a single unique(org_id, name) -- see module
    # docstring for why that would silently fail to protect system roles.
    op.create_index(
        'uq_roles_system_name', 'roles', ['name'],
        unique=True, postgresql_where=sa.text('org_id IS NULL'),
    )
    op.create_index(
        'uq_roles_org_name', 'roles', ['org_id', 'name'],
        unique=True, postgresql_where=sa.text('org_id IS NOT NULL'),
    )

    # --- Memberships table ---
    op.create_table(
        'memberships',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('org_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey(ORGANIZATIONS_ID_FK, ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey(USERS_ID_FK, ondelete='CASCADE'), nullable=False),
        sa.Column('role_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey(ROLES_ID_FK, ondelete='RESTRICT'), nullable=False),
        sa.Column('status', sa.String(20), server_default='active', nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint('org_id', 'user_id', name='uq_memberships_org_user'),
    )
    op.create_index('ix_memberships_org_id', 'memberships', ['org_id'])
    op.create_index('ix_memberships_user_id', 'memberships', ['user_id'])
    op.create_index('ix_memberships_role_id', 'memberships', ['role_id'])

    # --- Invitations table (pending, email-addressed; not yet a User/Membership) ---
    op.create_table(
        'invitations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('org_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey(ORGANIZATIONS_ID_FK, ondelete='CASCADE'), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('role_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey(ROLES_ID_FK, ondelete='RESTRICT'), nullable=False),
        sa.Column('invited_by_user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey(USERS_ID_FK, ondelete='SET NULL'), nullable=True),
        sa.Column('token', sa.String(255), nullable=False, unique=True),
        sa.Column('status', sa.String(20), server_default='pending', nullable=False),
        sa.Column('expires_at', sa.DateTime, nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint('org_id', 'email', name='uq_invitations_org_email'),
    )
    op.create_index('ix_invitations_org_id', 'invitations', ['org_id'])
    op.create_index('ix_invitations_email', 'invitations', ['email'])
    op.create_index('ix_invitations_role_id', 'invitations', ['role_id'])
    op.create_index('ix_invitations_invited_by_user_id', 'invitations', ['invited_by_user_id'])
    op.create_index('ix_invitations_token', 'invitations', ['token'])

    # --- Nullable org_id on existing tenant-owned tables (expand phase) ---
    for table in ORG_ID_TARGETS:
        op.add_column(
            table,
            sa.Column('org_id', postgresql.UUID(as_uuid=True),
                      sa.ForeignKey(ORGANIZATIONS_ID_FK, ondelete='RESTRICT'), nullable=True),
        )
        op.create_index(f'ix_{table}_org_id', table, ['org_id'])

    # --- Seed system roles (idempotent: skip if a system role with that name already exists) ---
    roles_table = sa.table(
        'roles',
        sa.column('id', postgresql.UUID(as_uuid=True)),
        sa.column('org_id', postgresql.UUID(as_uuid=True)),
        sa.column('name', sa.String),
        sa.column('permissions', postgresql.JSON),
        sa.column('is_system', sa.Boolean),
    )
    for role in SYSTEM_ROLES:
        insert_stmt = postgresql.insert(roles_table).values(
            id=uuid.uuid4(),
            org_id=None,
            name=role["name"],
            permissions=role["permissions"],
            is_system=True,
        ).on_conflict_do_nothing(
            index_elements=['name'], index_where=sa.text('org_id IS NULL'),
        )
        op.execute(insert_stmt)


def downgrade():
    for table in reversed(ORG_ID_TARGETS):
        op.drop_index(f'ix_{table}_org_id', table)
        op.drop_column(table, 'org_id')

    op.drop_index('ix_invitations_token', 'invitations')
    op.drop_index('ix_invitations_invited_by_user_id', 'invitations')
    op.drop_index('ix_invitations_role_id', 'invitations')
    op.drop_index('ix_invitations_email', 'invitations')
    op.drop_index('ix_invitations_org_id', 'invitations')
    op.drop_table('invitations')

    op.drop_index('ix_memberships_role_id', 'memberships')
    op.drop_index('ix_memberships_user_id', 'memberships')
    op.drop_index('ix_memberships_org_id', 'memberships')
    op.drop_table('memberships')

    op.drop_index('uq_roles_org_name', 'roles')
    op.drop_index('uq_roles_system_name', 'roles')
    op.drop_index('ix_roles_name', 'roles')
    op.drop_index('ix_roles_org_id', 'roles')
    op.drop_table('roles')

    op.drop_index('ix_organizations_owner_user_id', 'organizations')
    op.drop_index('ix_organizations_slug', 'organizations')
    op.drop_table('organizations')
