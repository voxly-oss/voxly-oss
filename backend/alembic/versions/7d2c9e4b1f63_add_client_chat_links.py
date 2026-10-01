"""Add client_chat_links (the native Voxly chat link channel)

Revision ID: 7d2c9e4b1f63
Revises: 5c3e1a9b7d24
Create Date: 2026-10-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '7d2c9e4b1f63'
down_revision: Union[str, None] = '5c3e1a9b7d24'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New, empty table — nothing existing is touched. The link token itself is
    # never stored (it is derived from the row id with an HMAC).
    op.create_table(
        'client_chat_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by_user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('last_opened_at', sa.DateTime(), nullable=True),
        sa.Column('last_opened_device', sa.String(120), nullable=True),
    )
    op.create_index('ix_client_chat_links_client_id', 'client_chat_links', ['client_id'])


def downgrade() -> None:
    op.drop_index('ix_client_chat_links_client_id', table_name='client_chat_links')
    op.drop_table('client_chat_links')
