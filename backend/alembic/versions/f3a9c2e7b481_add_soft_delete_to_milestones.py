"""Add soft delete to milestones

Revision ID: f3a9c2e7b481
Revises: 01abb4f68454
Create Date: 2026-07-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a9c2e7b481'
down_revision: Union[str, None] = '01abb4f68454'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Additive, nullable column — no backfill needed. Existing rows read
    # deleted_at = NULL, i.e. "not deleted", which is correct: nothing
    # already in this table was ever soft- or hard-deleted before this
    # migration (delete_milestone previously hard-deleted).
    op.add_column('milestones', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index(op.f('ix_milestones_deleted_at'), 'milestones', ['deleted_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_milestones_deleted_at'), table_name='milestones')
    op.drop_column('milestones', 'deleted_at')
