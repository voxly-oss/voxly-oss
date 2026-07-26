"""Add conversation metadata columns to chat_history

Revision ID: d29b6f814c3e
Revises: a7e4d19c6f52
Create Date: 2026-07-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd29b6f814c3e'
down_revision: Union[str, None] = 'a7e4d19c6f52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Additive, all nullable, no backfill — there is no real historical value
    # to backfill for any of these on existing rows (confidence/sentiment were
    # never computed at all; language/ai_response_time_ms were never measured
    # for messages processed before this migration). NULL correctly means
    # "not known", not a fabricated default.
    op.add_column('chat_history', sa.Column('confidence', sa.Float(), nullable=True))
    op.add_column('chat_history', sa.Column('sentiment', sa.String(20), nullable=True))
    op.add_column('chat_history', sa.Column('language', sa.String(5), nullable=True))
    op.add_column('chat_history', sa.Column('ai_response_time_ms', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('chat_history', 'ai_response_time_ms')
    op.drop_column('chat_history', 'language')
    op.drop_column('chat_history', 'sentiment')
    op.drop_column('chat_history', 'confidence')
