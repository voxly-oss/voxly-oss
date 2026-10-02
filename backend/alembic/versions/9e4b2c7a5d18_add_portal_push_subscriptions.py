"""Add portal_push_subscriptions (notifications for the Voxly chat link)

Revision ID: 9e4b2c7a5d18
Revises: 7d2c9e4b1f63
Create Date: 2026-10-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '9e4b2c7a5d18'
down_revision: Union[str, None] = '7d2c9e4b1f63'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New, empty table — nothing existing is touched.
    op.create_table(
        'portal_push_subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('link_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('client_chat_links.id', ondelete='CASCADE'), nullable=False),
        sa.Column('endpoint', sa.String(1024), nullable=False, unique=True),
        sa.Column('p256dh', sa.String(128), nullable=False),
        sa.Column('auth', sa.String(64), nullable=False),
        sa.Column('device', sa.String(120), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_portal_push_subscriptions_client_id', 'portal_push_subscriptions', ['client_id'])


def downgrade() -> None:
    op.drop_index('ix_portal_push_subscriptions_client_id', table_name='portal_push_subscriptions')
    op.drop_table('portal_push_subscriptions')
