"""Scope clients.phone uniqueness per-tenant, not globally

Closes BUG-04 in PRODUCTION_ACCEPTANCE_REPORT.md: clients.phone carried a
table-wide UNIQUE constraint, so once one agency (tenant) registered a client
with a given phone number, no other agency could ever register a client with
that same number -- a 409 that also functioned as a cross-tenant existence
oracle. Because clients are soft-deleted (deleted_at), a removed client's
phone number stayed permanently unusable, even by its own original owner.

Replaces the global constraint with a partial unique index on
(user_id, phone) WHERE deleted_at IS NULL: unique per-tenant, and only among
live rows, so a soft-deleted client's number frees up for reuse.

*** DEPLOYMENT NOTE ***
This migration does not run automatically as part of this change. Before
applying it to the production database:
  1. Check for existing cross-tenant phone collisions first --
     `SELECT phone, COUNT(DISTINCT user_id) FROM clients WHERE deleted_at IS
     NULL GROUP BY phone HAVING COUNT(DISTINCT user_id) > 1` -- should return
     zero rows, since the old global constraint made that impossible; this is
     a sanity check, not an expected finding.
  2. Run `alembic upgrade head` against the production DATABASE_URL as a
     deliberate, reviewed deploy step, not as a side effect of a code change.

Revision ID: 2f7b6e4c1a90
Revises: 8c1a4f2e9d3b
Create Date: 2026-07-27 21:15:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '2f7b6e4c1a90'
down_revision: Union[str, None] = '8c1a4f2e9d3b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 001_initial.py created both a column-level UNIQUE constraint (Postgres
    # auto-names an unnamed single-column UNIQUE as "<table>_<column>_key")
    # and a separately named unique index. Drop both defensively with
    # IF EXISTS so this is safe to re-run and doesn't hard-fail if either
    # name has drifted from what it was at creation time.
    op.execute("ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_phone_key")
    op.execute("DROP INDEX IF EXISTS ix_clients_phone")

    # Plain (non-unique) index so lookups by phone stay indexed.
    op.create_index("ix_clients_phone", "clients", ["phone"], unique=False)

    # Per-tenant, live-rows-only uniqueness.
    op.execute(
        "CREATE UNIQUE INDEX uq_clients_user_id_phone_active "
        "ON clients (user_id, phone) WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_clients_user_id_phone_active")
    op.execute("DROP INDEX IF EXISTS ix_clients_phone")
    op.create_index("ix_clients_phone", "clients", ["phone"], unique=True)
    op.execute(
        "ALTER TABLE clients ADD CONSTRAINT clients_phone_key UNIQUE (phone)"
    )
