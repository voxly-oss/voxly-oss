"""add_telegram_chat_id_and_channel_column

Revision ID: a1b2c3d4e5f6
Revises: 3a6ed180b03d
Create Date: 2026-04-13 00:00:00.000000

Adds:
  - clients.telegram_chat_id (VARCHAR 100, nullable, unique, indexed)
  - chat_history.channel (VARCHAR 20, NOT NULL default 'whatsapp', indexed)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '3a6ed180b03d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add telegram_chat_id to clients
    op.add_column(
        'clients',
        sa.Column('telegram_chat_id', sa.String(length=100), nullable=True)
    )
    op.create_index(
        'ix_clients_telegram_chat_id',
        'clients',
        ['telegram_chat_id'],
        unique=True
    )

    # Add channel column to chat_history (default to 'whatsapp' for existing rows)
    op.add_column(
        'chat_history',
        sa.Column('channel', sa.String(length=20), nullable=False, server_default='whatsapp')
    )
    op.create_index(
        'ix_chat_history_channel',
        'chat_history',
        ['channel'],
        unique=False
    )


def downgrade() -> None:
    # Reverse chat_history.channel
    op.drop_index('ix_chat_history_channel', table_name='chat_history')
    op.drop_column('chat_history', 'channel')

    # Reverse clients.telegram_chat_id
    op.drop_index('ix_clients_telegram_chat_id', table_name='clients')
    op.drop_column('clients', 'telegram_chat_id')
