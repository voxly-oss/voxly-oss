"""Add conversation_states table

Revision ID: a7e4d19c6f52
Revises: f3a9c2e7b481
Create Date: 2026-07-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a7e4d19c6f52'
down_revision: Union[str, None] = 'f3a9c2e7b481'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Brand new table — no existing data affected, no backfill needed.
    # One row per client, created lazily on that client's first processed
    # message (see messaging_core.py); clients with no messages yet simply
    # have no row here, which is correct (there is no state to report).
    op.create_table(
        'conversation_states',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('updated_by_user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index(
        op.f('ix_conversation_states_client_id'), 'conversation_states', ['client_id'], unique=True
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_conversation_states_client_id'), table_name='conversation_states')
    op.drop_table('conversation_states')
