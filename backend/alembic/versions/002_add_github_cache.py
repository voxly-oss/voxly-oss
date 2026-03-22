"""Add github_cache table

Revision ID: 002_add_github_cache
Revises: Previous migration (001)
Create Date: 2026-01-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '002_add_github_cache'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'github_cache',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('projects.id', ondelete='CASCADE'), 
                  nullable=False, unique=True),
        sa.Column('commits_count', sa.Integer, default=0),
        sa.Column('commits_last_7_days', sa.Integer, default=0),
        sa.Column('open_issues', sa.Integer, default=0),
        sa.Column('closed_issues', sa.Integer, default=0),
        sa.Column('pull_requests', sa.Integer, default=0),
        sa.Column('last_commit_message', sa.String(255)),
        sa.Column('last_commit_date', sa.DateTime),
        sa.Column('progress_percent', sa.Integer, default=0),
        sa.Column('synced_at', sa.DateTime, default=sa.func.now()),
    )
    
    # Create index on project_id for faster lookups
    op.create_index('ix_github_cache_project_id', 'github_cache', ['project_id'])
    op.create_index('ix_github_cache_synced_at', 'github_cache', ['synced_at'])


def downgrade():
    op.drop_index('ix_github_cache_synced_at', 'github_cache')
    op.drop_index('ix_github_cache_project_id', 'github_cache')
    op.drop_table('github_cache')
