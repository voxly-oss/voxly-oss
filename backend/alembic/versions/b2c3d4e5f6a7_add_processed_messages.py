"""add_processed_messages

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-02 00:00:00.000000

Adds the processed_messages idempotency ledger so retried WhatsApp/Telegram
webhook deliveries are handled exactly once (no duplicate AI replies / token spend).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'processed_messages',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('provider_message_id', sa.String(length=255), nullable=False),
        sa.Column('channel', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index(
        'ix_processed_messages_provider_message_id',
        'processed_messages',
        ['provider_message_id'],
        unique=True,
    )
    op.create_index(
        'ix_processed_messages_created_at',
        'processed_messages',
        ['created_at'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_processed_messages_created_at', table_name='processed_messages')
    op.drop_index('ix_processed_messages_provider_message_id', table_name='processed_messages')
    op.drop_table('processed_messages')
