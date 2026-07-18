"""
Phase 1 Milestone 2 backfill: create one personal Organization + owner
Membership per existing User, and stamp org_id onto every pre-existing
tenant-owned row (clients, projects, subscriptions, api_keys, usage_logs,
user_ai_keys).

Deliberately kept separate from the Alembic schema migrations -- schema
changes and data backfills have different blast radii and different
rollback mechanics (see docs/TARGET_ARCHITECTURE.md, DB strategy section).

Every step is idempotent and checked against current DB state rather than
any persisted checkpoint, so this script is safe to interrupt (Ctrl+C,
crash, deploy restart) and rerun at any point -- it simply resumes on
whichever users/rows are not yet done. It assumes single-process,
sequential execution (one operator running one instance at a time); it is
not designed for concurrent parallel runners.

Usage:
    python -m app.scripts.backfill_organizations              # interactive: shows pre-flight summary, asks to confirm
    python -m app.scripts.backfill_organizations --dry-run     # pre-flight summary only, no writes
    python -m app.scripts.backfill_organizations --yes         # skip the confirmation prompt
    python -m app.scripts.backfill_organizations --verify      # post-hoc consistency check, no writes
    python -m app.scripts.backfill_organizations --rollback    # undo the backfill -- see warnings in run_rollback()
"""
import argparse
import re
import sys
import time
import unicodedata
import uuid
from typing import Optional

from sqlalchemy import select, update, text
from sqlalchemy.orm import Session

from app.database import SessionLocal, Base
from app.models.user import User
from app.models.organization import Organization
from app.models.role import Role
from app.models.membership import Membership


# Tables with a direct user_id column, stamped straight from that column.
DIRECT_TABLES = ["clients", "subscriptions", "api_keys", "usage_logs", "user_ai_keys"]
# projects has no user_id; org_id is derived via its parent client.
ALL_TABLES_FOR_REPORTING = DIRECT_TABLES + ["projects"]

DEFAULT_BATCH_SIZE = 500
DEFAULT_CHUNK_SIZE = 5000

# Rough throughput assumptions for the pre-flight time estimate -- a
# heuristic for operator expectations, not a measured guarantee.
ESTIMATED_USERS_PER_SECOND = 20
ESTIMATED_ROWS_PER_SECOND = 2000


# ── Helpers ──────────────────────────────────────────────────────────


def _slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "org"


def _org_name_for(user: User) -> str:
    return user.agency_name or user.full_name or user.email.split("@")[0]


def _slug_for(user: User, name: str) -> str:
    # Deterministic and collision-free by construction (suffix derives from
    # the user's own id) rather than a check-then-increment loop.
    base = _slugify(name)[:90]
    suffix = uuid.UUID(str(user.id)).hex[:8]
    return f"{base}-{suffix}"


def _resolve_owner_role_id(db: Session):
    role = db.query(Role).filter(Role.org_id.is_(None), Role.name == "owner").first()
    if role is None:
        raise RuntimeError(
            "System role 'owner' not found. Has the Milestone 1 migration "
            "(c1f7825d5a5d) been applied? It seeds the 5 system roles."
        )
    return role.id


def _chunked_update_direct(db: Session, table_name: str, user_id, org_id, chunk_size: int) -> int:
    """Stamp org_id on rows of `table_name` owned by user_id, in chunks. Returns rows updated."""
    t = Base.metadata.tables[table_name]
    total = 0
    while True:
        subq = select(t.c.id).where(t.c.user_id == user_id, t.c.org_id.is_(None)).limit(chunk_size)
        stmt = update(t).where(t.c.id.in_(subq)).values(org_id=org_id)
        affected = db.execute(stmt).rowcount or 0
        total += affected
        if affected < chunk_size:
            break
    return total


def _chunked_update_projects(db: Session, user_id, org_id, chunk_size: int) -> int:
    """Stamp org_id on Projects owned (via their parent Client) by user_id, in chunks."""
    projects = Base.metadata.tables["projects"]
    clients = Base.metadata.tables["clients"]
    total = 0
    while True:
        subq = (
            select(projects.c.id)
            .select_from(projects.join(clients, projects.c.client_id == clients.c.id))
            .where(clients.c.user_id == user_id, projects.c.org_id.is_(None))
            .limit(chunk_size)
        )
        stmt = update(projects).where(projects.c.id.in_(subq)).values(org_id=org_id)
        affected = db.execute(stmt).rowcount or 0
        total += affected
        if affected < chunk_size:
            break
    return total


def _confirm(prompt: str) -> bool:
    try:
        answer = input(f"{prompt} [y/N]: ").strip().lower()
    except EOFError:
        return False
    return answer in ("y", "yes")


# ── Pre-flight summary ──────────────────────────────────────────────


class PreflightSummary:
    def __init__(self, users_to_process, orgs_to_create, memberships_to_create,
                 rows_to_update, estimated_seconds):
        self.users_to_process = users_to_process
        self.orgs_to_create = orgs_to_create
        self.memberships_to_create = memberships_to_create
        self.rows_to_update = rows_to_update
        self.estimated_seconds = estimated_seconds

    def is_noop(self) -> bool:
        return (
            self.users_to_process == 0
            and self.memberships_to_create == 0
            and sum(self.rows_to_update.values()) == 0
        )

    def render(self) -> str:
        lines = [
            "=" * 60,
            "MILESTONE 2 BACKFILL -- PRE-FLIGHT SUMMARY",
            "=" * 60,
            f"Users to process:          {self.users_to_process}",
            f"Organizations to create:   {self.orgs_to_create}",
            f"Memberships to create:     {self.memberships_to_create}",
            "Rows to update per table:",
        ]
        for table, count in self.rows_to_update.items():
            lines.append(f"  {table:<16} {count}")
        lines.append(
            f"Estimated execution time:  ~{self.estimated_seconds:.1f}s "
            f"({self.estimated_seconds / 60:.1f} min)"
        )
        lines.append("=" * 60)
        return "\n".join(lines)


def compute_preflight_summary(db: Session) -> PreflightSummary:
    users_to_process = db.execute(text(
        "SELECT COUNT(*) FROM users u WHERE NOT EXISTS "
        "(SELECT 1 FROM organizations o WHERE o.owner_user_id = u.id)"
    )).scalar_one()

    existing_orgs_missing_membership = db.execute(text(
        "SELECT COUNT(*) FROM organizations o WHERE NOT EXISTS "
        "(SELECT 1 FROM memberships m WHERE m.org_id = o.id AND m.user_id = o.owner_user_id)"
    )).scalar_one()

    rows_to_update = {}
    for table in ALL_TABLES_FOR_REPORTING:
        rows_to_update[table] = db.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE org_id IS NULL")
        ).scalar_one()

    total_rows = sum(rows_to_update.values())
    estimated_seconds = (
        users_to_process / ESTIMATED_USERS_PER_SECOND
        + total_rows / ESTIMATED_ROWS_PER_SECOND
    )

    return PreflightSummary(
        users_to_process=users_to_process,
        orgs_to_create=users_to_process,
        memberships_to_create=users_to_process + existing_orgs_missing_membership,
        rows_to_update=rows_to_update,
        estimated_seconds=estimated_seconds,
    )


# ── Backfill ─────────────────────────────────────────────────────────


def run_backfill(batch_size: int = DEFAULT_BATCH_SIZE, chunk_size: int = DEFAULT_CHUNK_SIZE,
                  dry_run: bool = False, auto_confirm: bool = False, db: Optional[Session] = None) -> None:
    """db: inject a Session (tests) to avoid touching the production database
    bound to SessionLocal; when omitted (CLI usage) a real session is opened
    and closed here."""
    owns_session = db is None
    if owns_session:
        db = SessionLocal()
    try:
        summary = compute_preflight_summary(db)
        print(summary.render())

        if summary.is_noop():
            print("\nNothing to do -- backfill already complete.")
            return

        if dry_run:
            print("\n--dry-run: no writes performed.")
            return

        if not auto_confirm and not _confirm("\nProceed with backfill?"):
            print("Aborted -- no changes made.")
            return

        owner_role_id = _resolve_owner_role_id(db)

        processed_users = 0
        created_orgs = 0
        created_memberships = 0
        stamped_rows = {t: 0 for t in ALL_TABLES_FOR_REPORTING}

        last_id = None
        start = time.monotonic()

        while True:
            query = db.query(User).order_by(User.id)
            if last_id is not None:
                query = query.filter(User.id > last_id)
            batch = query.limit(batch_size).all()
            if not batch:
                break

            for user in batch:
                last_id = user.id
                try:
                    org = db.query(Organization).filter(Organization.owner_user_id == user.id).first()
                    if org is None:
                        name = _org_name_for(user)
                        org = Organization(
                            name=name,
                            slug=_slug_for(user, name),
                            owner_user_id=user.id,
                            billing_region=user.billing_region or "INTL",
                        )
                        db.add(org)
                        db.flush()
                        created_orgs += 1

                    existing_membership = db.query(Membership).filter(
                        Membership.org_id == org.id, Membership.user_id == user.id
                    ).first()
                    if existing_membership is None:
                        db.add(Membership(
                            org_id=org.id, user_id=user.id,
                            role_id=owner_role_id, status="active",
                        ))
                        db.flush()
                        created_memberships += 1

                    for table in DIRECT_TABLES:
                        stamped_rows[table] += _chunked_update_direct(db, table, user.id, org.id, chunk_size)
                    stamped_rows["projects"] += _chunked_update_projects(db, user.id, org.id, chunk_size)

                    db.commit()
                    processed_users += 1
                except Exception:
                    db.rollback()
                    print(
                        f"\nFAILED while processing user {user.id} ({user.email}). "
                        f"Already-committed users are unaffected. Fix the issue and rerun -- "
                        f"the backfill is idempotent and will resume from here."
                    )
                    raise

            print(f"  ... processed {processed_users} users so far")

        elapsed = time.monotonic() - start
        print("\n" + "=" * 60)
        print("BACKFILL COMPLETE")
        print("=" * 60)
        print(f"Users processed:        {processed_users}")
        print(f"Organizations created:  {created_orgs}")
        print(f"Memberships created:    {created_memberships}")
        for table, count in stamped_rows.items():
            print(f"Rows stamped ({table}): {count}")
        print(f"Elapsed:                {elapsed:.1f}s")

    finally:
        if owns_session:
            db.close()


# ── Verification ─────────────────────────────────────────────────────


def run_verify(db: Optional[Session] = None) -> bool:
    owns_session = db is None
    if owns_session:
        db = SessionLocal()
    ok = True
    try:
        print("=" * 60)
        print("MILESTONE 2 BACKFILL -- VERIFICATION")
        print("=" * 60)

        for table in ALL_TABLES_FOR_REPORTING:
            count = db.execute(text(f"SELECT COUNT(*) FROM {table} WHERE org_id IS NULL")).scalar_one()
            status = "OK" if count == 0 else "FAIL"
            ok = ok and count == 0
            print(f"  [{status}] {table}: {count} rows with org_id IS NULL (expect 0)")

        users_without_org = db.execute(text(
            "SELECT COUNT(*) FROM users u WHERE NOT EXISTS "
            "(SELECT 1 FROM organizations o WHERE o.owner_user_id = u.id)"
        )).scalar_one()
        status = "OK" if users_without_org == 0 else "FAIL"
        ok = ok and users_without_org == 0
        print(f"  [{status}] users without an owned organization: {users_without_org} (expect 0)")

        # ORM-typed comparison, not raw text() with a manually str()-formatted
        # UUID param: SQLite's generic Uuid type stores values as 32-char hex
        # (no dashes), so comparing against str(uuid_obj) (36-char, hyphenated)
        # would silently never match under the test harness's SQLite dialect.
        owner_role_id = _resolve_owner_role_id(db)
        membership_exists = (
            select(Membership.id)
            .where(
                Membership.org_id == Organization.id,
                Membership.user_id == Organization.owner_user_id,
                Membership.role_id == owner_role_id,
            )
            .exists()
        )
        orgs_without_owner_membership = db.execute(
            select(Organization.id).where(~membership_exists)
        ).all()
        orgs_without_owner_membership = len(orgs_without_owner_membership)
        status = "OK" if orgs_without_owner_membership == 0 else "FAIL"
        ok = ok and orgs_without_owner_membership == 0
        print(f"  [{status}] organizations missing an owner membership: {orgs_without_owner_membership} (expect 0)")

        print("=" * 60)
        print("VERIFICATION PASSED" if ok else "VERIFICATION FAILED")
        return ok
    finally:
        if owns_session:
            db.close()


# ── Rollback ─────────────────────────────────────────────────────────


def run_rollback(chunk_size: int = DEFAULT_CHUNK_SIZE, auto_confirm: bool = False,
                  db: Optional[Session] = None) -> None:
    owns_session = db is None
    if owns_session:
        db = SessionLocal()
    try:
        org_count = db.execute(text("SELECT COUNT(*) FROM organizations")).scalar_one()
        membership_count = db.execute(text("SELECT COUNT(*) FROM memberships")).scalar_one()
        rows_to_clear = {}
        for table in ALL_TABLES_FOR_REPORTING:
            rows_to_clear[table] = db.execute(
                text(f"SELECT COUNT(*) FROM {table} WHERE org_id IS NOT NULL")
            ).scalar_one()

        print("=" * 60)
        print("MILESTONE 2 BACKFILL -- ROLLBACK PRE-FLIGHT")
        print("=" * 60)
        print("WARNING: this deletes ALL organizations and memberships. It is only")
        print("safe BEFORE Milestone 3 (dual-write) ships -- after that, some orgs")
        print("may be organically created (not just backfilled), and this blanket")
        print("rollback would destroy those too. Do not run this after Milestone 3.")
        print(f"\nOrganizations to delete:  {org_count}")
        print(f"Memberships to delete:    {membership_count}")
        print("Rows to clear org_id on:")
        for table, count in rows_to_clear.items():
            print(f"  {table:<16} {count}")
        print("=" * 60)

        if not auto_confirm and not _confirm("\nProceed with rollback?"):
            print("Aborted -- no changes made.")
            return

        for table_name in ALL_TABLES_FOR_REPORTING:
            t = Base.metadata.tables[table_name]
            while True:
                subq = select(t.c.id).where(t.c.org_id.is_not(None)).limit(chunk_size)
                stmt = update(t).where(t.c.id.in_(subq)).values(org_id=None)
                affected = db.execute(stmt).rowcount or 0
                db.commit()
                if affected < chunk_size:
                    break

        db.query(Membership).delete()
        db.query(Organization).delete()
        db.commit()
        print("Rollback complete.")
    finally:
        if owns_session:
            db.close()


# ── CLI ──────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Milestone 2: backfill Organizations/Memberships and stamp org_id."
    )
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--chunk-size", type=int, default=DEFAULT_CHUNK_SIZE)
    parser.add_argument("--dry-run", action="store_true", help="Show the pre-flight summary only; no writes.")
    parser.add_argument("--yes", action="store_true", help="Skip the interactive confirmation prompt.")
    parser.add_argument("--verify", action="store_true", help="Run post-hoc verification queries only; no writes.")
    parser.add_argument("--rollback", action="store_true", help="Undo the backfill. See warnings before Milestone 3.")
    args = parser.parse_args()

    if args.verify:
        ok = run_verify()
        sys.exit(0 if ok else 1)

    if args.rollback:
        run_rollback(chunk_size=args.chunk_size, auto_confirm=args.yes)
        return

    run_backfill(
        batch_size=args.batch_size, chunk_size=args.chunk_size,
        dry_run=args.dry_run, auto_confirm=args.yes,
    )


if __name__ == "__main__":
    main()
