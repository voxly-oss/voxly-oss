"""Add token_version to users (session revocation on password change)

Closes BUG-08 / PRODUCTION_ACCEPTANCE_REPORT.md S-1: a JWT minted before a
password change kept authenticating for its full lifetime, so a stolen token
survived the victim's own remediation. token_version is embedded in every
newly issued access token and compared against the stored value in
get_current_user() on every request; change-password and password-reset both
bump it, which invalidates every token minted before that moment.

server_default='0' means every existing row gets 0 with no backfill step,
matching every freshly-decoded pre-existing token's implicit (missing) `tv`
claim -- so this migration doesn't force-log-out any session already in
flight at deploy time.

Purely additive: no existing column, data, or application code path is
touched or removed.

Revision ID: 8c1a4f2e9d3b
Revises: 5b8e3c1f9a2d
Create Date: 2026-07-27 21:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '8c1a4f2e9d3b'
down_revision: Union[str, None] = '5b8e3c1f9a2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('users', 'token_version')
