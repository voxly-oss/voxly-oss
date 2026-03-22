"""Add SaaS tables: plans, subscriptions, api_keys, usage_logs + user billing fields

Revision ID: 003_add_saas_tables
Revises: 002_add_github_cache
Create Date: 2026-02-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '003_add_saas_tables'
down_revision = '002_add_github_cache'
branch_labels = None
depends_on = None


def upgrade():
    # --- Plans table ---
    op.create_table(
        'plans',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('slug', sa.String(50), nullable=False, unique=True),
        sa.Column('tier_level', sa.Integer, nullable=False, server_default='0'),
        sa.Column('price_monthly', sa.Float, server_default='0'),
        sa.Column('price_yearly', sa.Float, server_default='0'),
        sa.Column('currency', sa.String(3), server_default='USD'),
        sa.Column('max_clients', sa.Integer, server_default='5'),
        sa.Column('max_projects', sa.Integer, server_default='3'),
        sa.Column('max_api_keys', sa.Integer, server_default='1'),
        sa.Column('rate_limit_per_minute', sa.Integer, server_default='10'),
        sa.Column('rate_limit_per_day', sa.Integer, server_default='100'),
        sa.Column('max_ai_messages_per_month', sa.Integer, server_default='50'),
        sa.Column('features', postgresql.JSON, server_default='{}'),
        sa.Column('is_active', sa.Boolean, server_default='true'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # --- Subscriptions table ---
    op.create_table(
        'subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('plan_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('plans.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('status', sa.String(50), server_default='active', nullable=False),
        sa.Column('payment_gateway', sa.String(20), nullable=True),
        sa.Column('gateway_subscription_id', sa.String(255), nullable=True, unique=True),
        sa.Column('gateway_customer_id', sa.String(255), nullable=True),
        sa.Column('current_period_start', sa.DateTime, nullable=True),
        sa.Column('current_period_end', sa.DateTime, nullable=True),
        sa.Column('cancel_at_period_end', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_subscriptions_user_id', 'subscriptions', ['user_id'])
    op.create_index('ix_subscriptions_plan_id', 'subscriptions', ['plan_id'])

    # --- API Keys table ---
    op.create_table(
        'api_keys',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('key_hash', sa.String(255), nullable=False),
        sa.Column('key_prefix', sa.String(20), nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('scopes', postgresql.JSON, server_default='[]'),
        sa.Column('is_active', sa.Boolean, server_default='true'),
        sa.Column('last_used_at', sa.DateTime, nullable=True),
        sa.Column('expires_at', sa.DateTime, nullable=True),
        sa.Column('revoked_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_api_keys_user_id', 'api_keys', ['user_id'])
    op.create_index('ix_api_keys_key_prefix', 'api_keys', ['key_prefix'])

    # --- Usage Logs table ---
    op.create_table(
        'usage_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('api_key_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('api_keys.id', ondelete='CASCADE'), nullable=True),
        sa.Column('date', sa.Date, nullable=False),
        sa.Column('endpoint', sa.String(255), nullable=True),
        sa.Column('method', sa.String(10), nullable=True),
        sa.Column('request_count', sa.Integer, server_default='1'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_usage_logs_user_id', 'usage_logs', ['user_id'])
    op.create_index('ix_usage_logs_api_key_id', 'usage_logs', ['api_key_id'])
    op.create_index('ix_usage_logs_date', 'usage_logs', ['date'])

    # --- User model updates ---
    op.add_column('users', sa.Column('billing_region', sa.String(10), server_default='INTL'))
    
    # Update existing subscription_tier default from 'starter' to 'free'
    op.alter_column('users', 'subscription_tier', server_default='free')


def downgrade():
    # Remove user columns
    op.alter_column('users', 'subscription_tier', server_default='starter')
    op.drop_column('users', 'billing_region')

    # Drop tables in reverse dependency order
    op.drop_index('ix_usage_logs_date', 'usage_logs')
    op.drop_index('ix_usage_logs_api_key_id', 'usage_logs')
    op.drop_index('ix_usage_logs_user_id', 'usage_logs')
    op.drop_table('usage_logs')

    op.drop_index('ix_api_keys_key_prefix', 'api_keys')
    op.drop_index('ix_api_keys_user_id', 'api_keys')
    op.drop_table('api_keys')

    op.drop_index('ix_subscriptions_plan_id', 'subscriptions')
    op.drop_index('ix_subscriptions_user_id', 'subscriptions')
    op.drop_table('subscriptions')

    op.drop_table('plans')
