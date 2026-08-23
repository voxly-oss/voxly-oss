"""Add unique constraint on organizations.owner_user_id (P0-1 prerequisite)

Closes a documented gap called out in tenant_context.py's own docstring:
get_or_create_personal_org() is idempotent under sequential retry but not
under true concurrent races, since nothing stopped two simultaneous
self-heal calls for the same user from each inserting an Organization row.

The account-deletion fix (P0-1, see ACCOUNT_DELETION_DESIGN.md) looks up
"the" organization a user owns via a single `.first()` on owner_user_id and
assumes there is at most one. This constraint makes that assumption true at
the database level instead of merely true in practice.

Purely additive: no existing column, data, or application code is touched.
Safe to deploy independently of the account-deletion code change.

Revision ID: 5b8e3c1f9a2d
Revises: d29b6f814c3e
Create Date: 2026-07-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '5b8e3c1f9a2d'
down_revision: Union[str, None] = 'd29b6f814c3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        'uq_organizations_owner_user_id', 'organizations', ['owner_user_id']
    )


def downgrade() -> None:
    op.drop_constraint('uq_organizations_owner_user_id', 'organizations', type_='unique')
