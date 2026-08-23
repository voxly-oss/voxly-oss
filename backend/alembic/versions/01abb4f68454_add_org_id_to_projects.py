"""Phase 1 Milestone 2 (expand step): add nullable org_id to projects

Projects don't carry a user_id column (only client_id), so they were not
included in Milestone 1's org_id expansion, which mirrored the set of
tables that already had user_id. The Milestone 2 backfill needs to stamp
org_id on Projects too (derived from their parent Client), so this small
expand-only migration adds the column first. Same shape, same safety
profile as every org_id column added in c1f7825d5a5d: nullable, indexed,
FK to organizations.id ON DELETE RESTRICT, not read by any application
code yet. Safe to deploy and safe to roll back at any time.

Revision ID: 01abb4f68454
Revises: c1f7825d5a5d
Create Date: 2026-07-17

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '01abb4f68454'
down_revision = 'c1f7825d5a5d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'projects',
        sa.Column('org_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='RESTRICT'), nullable=True),
    )
    op.create_index('ix_projects_org_id', 'projects', ['org_id'])


def downgrade():
    op.drop_index('ix_projects_org_id', 'projects')
    op.drop_column('projects', 'org_id')
