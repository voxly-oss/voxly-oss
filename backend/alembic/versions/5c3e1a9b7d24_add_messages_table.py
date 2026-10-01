"""Add messages table (per-message conversation history) and backfill it

Revision ID: 5c3e1a9b7d24
Revises: 2f7b6e4c1a90
Create Date: 2026-10-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '5c3e1a9b7d24'
down_revision: Union[str, None] = '2f7b6e4c1a90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # One row per message (inbound/outbound; client/ai/agent). chat_history
    # stays in place and is still dual-written; this backfills its pairs.
    op.create_table(
        'messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
        sa.Column('channel', sa.String(20), nullable=False),
        sa.Column('direction', sa.String(10), nullable=False),
        sa.Column('author_type', sa.String(10), nullable=False),
        sa.Column('author_user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('status', sa.String(12), nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('external_id', sa.String(255), nullable=True),
        sa.Column('reply_to_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('messages.id', ondelete='SET NULL'), nullable=True),
        sa.Column('model_used', sa.String(100), nullable=True),
        sa.Column('tokens_used', sa.Integer(), nullable=True),
        sa.Column('ai_response_time_ms', sa.Integer(), nullable=True),
        sa.Column('language', sa.String(5), nullable=True),
        sa.Column('legacy_chat_history_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_messages_client_created', 'messages', ['client_id', 'created_at'])
    op.create_index('ix_messages_legacy_chat_history_id', 'messages', ['legacy_chat_history_id'])

    from app.services.message_backfill import backfill_messages_from_chat_history
    backfill_messages_from_chat_history(op.get_bind())


def downgrade() -> None:
    # chat_history was never modified, so dropping the table loses nothing that
    # existed before this migration (only messages written since).
    op.drop_index('ix_messages_legacy_chat_history_id', table_name='messages')
    op.drop_index('ix_messages_client_created', table_name='messages')
    op.drop_table('messages')
