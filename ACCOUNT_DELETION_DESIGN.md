# P0-1 Design Doc: Account Deletion (`DELETE /api/v1/auth/me`)

Status: **Design only — no code changed.** Companion to `PRODUCTION_READINESS_AUDIT.md` §3 (P0-1).
Scope: root cause, architecture decision, and implementation strategy for the broken GDPR
account-deletion endpoint.

**Revision note:** v1 of this document recommended a soft-delete-first, hard-purge-later hybrid.
That recommendation was reviewed and rejected — correctly. This revision replaces §5 onward with
a **transactional hard-delete design**, per the reviewer's instruction: *"Revise the design
assuming transactional hard deletion as the primary implementation. Only introduce soft deletion
if you can demonstrate a concrete legal, operational, or business requirement that cannot be
satisfied with a transactional hard-delete workflow. Include a complete entity dependency graph
and prove that every foreign-key path is handled within a single transaction before any code
changes."* §1–4 (root cause, exact FK chain, architecture conflict) are unchanged from v1 — they
were explicitly approved — and are reproduced below for a self-contained document.

---

## 1. Why deletion fails

`backend/app/api/v1/auth.py:699-719`:

```python
@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("2/minute")
async def delete_user_account(*, request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        db.delete(current_user)
        db.commit()
    except Exception as e:
        ...
        raise HTTPException(500, "Failed to delete account")
```

`User` (`backend/app/models/user.py`) declares ORM-level `cascade="all, delete-orphan"` on
`clients`, `api_keys`, `subscription`, `usage_logs`, `ai_keys` — all backed by matching
`ON DELETE CASCADE` at the DB layer. Those rows delete cleanly.

`User` declares **no relationship at all** to `Organization`. The only relationship is defined
on the *other* side — `Organization.owner = relationship("User", foreign_keys=[owner_user_id])`
(`backend/app/models/organization.py:23`) — which SQLAlchemy does not walk when cascading a
delete from the `User` side. So when Postgres executes the resulting `DELETE FROM users WHERE
id = :id`, it still finds a live row in `organizations.owner_user_id` pointing at this user, and
the FK is declared `ondelete='RESTRICT'`. Postgres raises `ForeignKeyViolation`, SQLAlchemy
surfaces it as `IntegrityError`, the bare `except Exception` catches it, rolls back, and returns
a 500. This was reproduced live during the audit with a real registered account.

The `Organization` row exists at all only because `resolve_tenant_context()`
(`backend/app/utils/tenant_context.py:137-187`) self-heals — auto-creating a personal
`Organization` + `Membership` for a user the first time tenant context is resolved — and that
path is live in production because `DUAL_WRITE_ORGANIZATIONS_ENABLED` is `True` there today,
despite defaulting to `False` in code (`backend/app/config.py:84`, audit P2-2). Every user who
has hit any org-scoped endpoint (client/project creation goes through `get_tenant_context`,
`backend/app/api/v1/clients.py:43`, `projects.py:62`) since that flag went live now owns exactly
one `Organization` row, and none of them can delete their account.

## 2. The exact foreign-key chain

Two layers, both real in production today:

**Layer 1 — always hit first, for every affected user:**
```
users.id  <—(RESTRICT)—  organizations.owner_user_id
```
(`c1f7825d5a5d_add_organizations_roles_memberships.py:90-91`). This is the FK that produces the
reproduced 500. It fires regardless of whether the user has any clients or projects — merely
having triggered the self-heal once is enough.

**Layer 2 — hit next, if Layer 1 is "fixed" by naively deleting the Organization row first:**
```
organizations.id  <—(RESTRICT)—  clients.org_id
organizations.id  <—(RESTRICT)—  projects.org_id
organizations.id  <—(RESTRICT)—  api_keys.org_id
organizations.id  <—(RESTRICT)—  user_ai_keys.org_id
organizations.id  <—(RESTRICT)—  subscriptions.org_id
organizations.id  <—(RESTRICT)—  usage_logs.org_id
organizations.id  <—(RESTRICT)—  roles.org_id            (dormant — no endpoint creates org-scoped roles today)
```
`clients.py:60` and `projects.py:80` both write `org_id=tenant.org_id` under the same live flag
(the Milestone 3 dual-write), so any user who has created at least one client or project since
the flag flipped has non-null `org_id` rows here — Layer 2 is not hypothetical, it is live data.

**Safe by construction (cascade correctly, no action needed):**
```
organizations.id  <—(CASCADE)—  memberships.org_id
organizations.id  <—(CASCADE)—  invitations.org_id
users.id          <—(CASCADE)—  memberships.user_id
users.id          <—(SET NULL)— invitations.invited_by_user_id
users.id          <—(SET NULL)— conversation_states.assigned_to
```

Net effect: fixing Layer 1 alone (e.g. `db.delete(org)` before `db.delete(user)`) is
**insufficient** — see §5's ordering analysis for exactly why a naive two-call fix still fails.

## 3. Current production behavior vs. code's intended architecture

These are in conflict, and that conflict *is* the root cause:

- **Code default** (`DUAL_WRITE_ORGANIZATIONS_ENABLED=False`): the org model is schema-only,
  inert. `Organization.__doc__` literally says "Introduced in Phase 1 (Milestone 1: schema only,
  not yet load-bearing)." Under this default, `resolve_tenant_context()` is a zero-query no-op
  and the flat `db.delete(current_user)` is correct — there is nothing else to clean up.
- **Actual production value**: `True` (confirmed live during the audit, contradicting the
  checked-in default — undocumented drift, audit P2-2). Under this value, every user silently
  gains an owned `Organization` the moment they touch a tenant-scoped endpoint, and the deletion
  code was never updated to match.

**Agreed conclusion (reviewer, confirmed):** the real bug is not "one missing FK handler" — it's
that production architecture already changed (Phase 1 dual-write is live) while the deletion
workflow was never updated to match it.

## 4. Recommended long-term tenancy model

**Commit forward to org-based multi-tenancy; do not roll the flag back to `False`.** Reviewer-
approved: rolling back would leave two classes of users (with-org and without-org) instead of
one consistent model, which is strictly worse than today.

One related, adjacent gap to close in the same migration window: there is no unique constraint
on `organizations.owner_user_id` yet (flagged in the code's own docstring,
`tenant_context.py:85-88`). Without it, a concurrent self-heal race could in theory let a user
acquire more than one owned org, which the transaction in §5 depends on not being possible
(it looks up "the" org by `owner_user_id`, singular).

---

## 5. Entity ownership model — person vs. organization (answered before implementation)

**Today, in production, every entity is still functionally owned by the User, not the
Organization.** This was verified by reading the actual query filters, not inferred:

| Table | Read-path filter used by every endpoint | Evidence |
|---|---|---|
| `clients` | `Client.user_id == current_user.id` | `clients.py:29,49,113,136,186` |
| `projects` | `Project.client_id.in_(user_client_ids)` (client_ids themselves resolved via `user_id`) | `projects.py:40,126,152,207`, `dashboard.py:119` |
| `api_keys` / `user_ai_keys` | `.user_id == current_user.id` | `auth.py:655-656` |
| `subscriptions` | `Subscription.user_id == user_id` | `billing.py:189,250`, `super_admin.py:161,237,392` |

**Not one read path anywhere in the API layer filters by `org_id`.** `org_id` is written on
every `Client`/`Project`/`APIKey`/`UserAIKey`/`Subscription`/`UsageLog` row (Milestone 3
dual-write) but is never once consulted for access control, listing, or ownership checks. This
directly answers the reviewer's question:

- **`user_id`** is the real, load-bearing, Phase-0 ownership column. It is `NOT NULL` everywhere
  it appears and is what every authorization check actually uses today.
- **`org_id`** is a Phase-1/2 column being populated in advance of a cutover that hasn't
  happened yet (`nullable=True` everywhere, `shadow_verify_read()` exists in
  `tenant_context.py:200-231` specifically to validate org-scoped reads *before* cutover, and is
  confirmed **not wired into any read endpoint** — audit finding). It exists to make the future
  cutover possible without a backfill, not because anything depends on it today.

**Why `Client` "still has `user_id`" even though `Organization` is meant to own it long-term:**
because the codebase is mid-migration (Phase 1 of a multi-phase plan), and dual-write is
specifically the technique of populating the new column on every write while the old column
stays authoritative for reads — exactly what's happening here. This is not an accident to fix as
part of P0-1; it's the intended shape of an in-progress migration, and it should stay this way
until Phase 2 (org-scoped read cutover) is deliberately done as its own milestone.

**Consequence for this design:** because `org_id` is not yet load-bearing, and because Phase 3
(invitations) was never built (audit P2-1 — no endpoint exists to create a `Membership` for
anyone other than an org's own auto-created owner), **every `Organization` in production today
has exactly one member: its owner.** The transaction in §7 is designed around that fact, with an
explicit runtime check (not an assumption) that fails safe if it's ever untrue.

One more entity worth naming explicitly since it's easy to miss: `Client.deleted_at` already
exists, and `DELETE /api/v1/clients/{id}` (`clients.py:177-206`) already **soft-deletes** —
`client.deleted_at = datetime.now(timezone.utc)`. This is the codebase's one existing precedent
for soft delete, and it is scoped to an individual business record a user chooses to archive —
not to account closure. It is unaffected by this design: a hard account deletion removes the
`Client` row (and its `deleted_at` value) entirely regardless of whether it was already
soft-deleted, which is the correct terminal behavior either way.

## 6. Complete entity dependency graph

Every FK in the schema that terminates at `users.id` or `organizations.id`, confirmed by
grepping every model file (`backend/app/models/*.py`) for `ForeignKey("users.id"...)` and
`ForeignKey("organizations.id"...)` — no other FK references either table:

```
User (users)
 │
 ├─ Membership.user_id            CASCADE     (ORM: no direct relationship on User; reached
 │                                              transitively when Organization is deleted, or
 │                                              directly at the DB level)
 ├─ Invitation.invited_by_user_id SET NULL    (not this user's own row — no action needed)
 ├─ ConversationState.assigned_to SET NULL    (not this user's own row — no action needed)
 │
 ├─ Client.user_id                CASCADE  ─┐
 ├─ APIKey.user_id                CASCADE   │  ORM cascade="all, delete-orphan"
 ├─ UserAIKey.user_id             CASCADE   │  declared on User (user.py:31-35) —
 ├─ Subscription.user_id          CASCADE   │  already correct, already works today
 ├─ UsageLog.user_id              CASCADE  ─┘
 │
 └─ Organization.owner_user_id    RESTRICT  ← the one edge with NO relationship declared on
                                              either side that SQLAlchemy would auto-cascade.
                                              This is Layer 1. Must be handled explicitly.

Client (clients)                   [reached via Client.user_id above]
 ├─ Project.client_id             CASCADE (+ ORM cascade, client.py:29)
 ├─ ChatHistory.client_id         CASCADE (+ ORM cascade, client.py:30)
 └─ ConversationState.client_id   CASCADE (+ ORM cascade, uselist=False, client.py:31-33)

Project (projects)                 [reached via Project.client_id above]
 ├─ Milestone.project_id          CASCADE
 ├─ GitHubCache.project_id        CASCADE
 └─ ChatHistory.project_id        SET NULL  (redundant path — the row is already gone via
                                              Client.chat_history CASCADE above by the time
                                              this would matter)

APIKey (api_keys)                  [reached via APIKey.user_id above]
 └─ UsageLog.api_key_id           CASCADE (same rows already covered by UsageLog.user_id CASCADE)

Organization (organizations)       [NOT reached from User automatically — must be deleted
                                     explicitly; this is Layer 1]
 ├─ Membership.org_id             CASCADE  (DB-level; no explicit delete needed)
 ├─ Invitation.org_id             CASCADE  (DB-level; no explicit delete needed — also
 │                                           currently always empty, no invitation flow exists)
 ├─ Client.org_id                 RESTRICT ─┐
 ├─ Project.org_id                RESTRICT  │
 ├─ APIKey.org_id                 RESTRICT  │  Layer 2. Every one of these rows, for a
 ├─ UserAIKey.org_id              RESTRICT  │  solo-owner org (§5), is the SAME row already
 ├─ Subscription.org_id           RESTRICT  │  reached via the User.user_id CASCADE edges
 ├─ UsageLog.org_id               RESTRICT  │  above — so they must be deleted BEFORE the
 └─ Role.org_id                   RESTRICT ─┘  Organization row, not after (see §7 ordering).
                                                Role is dormant: no org-scoped Role has ever
                                                been created (no endpoint exists, audit P2-1).

Dead ends, not reachable from this flow at all (named so nothing is "discovered after
deployment"):
 - Plan (referenced by Subscription.plan_id, RESTRICT) — global reference data, never deleted.
 - Role rows with org_id IS NULL (the 5 seeded system roles) — global, never deleted.
```

This confirms the reviewer's read exactly: **two** explicit actions are required beyond what
already works (User's existing cascade) — clearing Layer 2, then Layer 1 — and they must happen
**in that order**, not the order that looks natural (org first, then user).

## 7. Why order matters — the transaction

A naive two-call fix —

```python
db.delete(org)
db.delete(user)
```

— fails immediately, on the *first* line, not the second. At the moment `db.delete(org)` is
flushed, `Client.org_id`, `Project.org_id`, `APIKey.org_id`, etc. still point at this org (the
user's rows haven't been touched yet), so Layer 2's `RESTRICT` fires right away. This is the
exact mistake the reviewer called out as the common wrong instinct.

The reverse order — `db.delete(user)` first — also fails: SQLAlchemy's unit-of-work computes the
User's cascade closure (Client → Project → …, APIKey → UsageLog, UserAIKey, Subscription) and
emits those DELETEs *and* the final `DELETE FROM users` in one flush. By the time that flush
reaches `DELETE FROM users`, `Organization.owner_user_id` still references the row — Layer 1
fires, which is exactly today's bug.

**A single `db.delete(user)` call cannot be made to work no matter what order it's combined
with**, because SQLAlchemy flushes an object's entire cascade tree — including the object
itself — atomically within one flush; you cannot ask it to cascade the children now and the
parent later. (An alternative considered and rejected: declaring a new `User.owned_organization`
relationship with `cascade="all, delete-orphan"` so `db.delete(user)` cascades to `Organization`
too. Rejected because SQLAlchemy's cascade-ordering is driven by the *declared relationship
graph*, not raw FK introspection — `Client.org_id` has no relationship declared on it at all
(`organization.py` only declares `owner` and `memberships`), so the ORM has no way to know
`Client` rows must be gone before `Organization` is deleted. Relying on that would be an
undocumented assumption about SQLAlchemy internals resolving an ordering it was never told about
— exactly the kind of implicit behavior this fix needs to avoid.)

**The only correct order is explicit, procedural, and manual**, inside one DB transaction. This
is the version finalized after the pre-implementation review in §15 — it differs from the first
draft in three ways the review surfaced: `UsageLog` is now explicitly cleared (§15.2 found the
original draft left it exposed to a real Layer-2 failure), the row lock targets `users` rather
than `organizations` (§15.3 found locking the org alone leaves a gap), and step 1 uses bulk
`Query.delete()` instead of per-object ORM iteration (§15.1 and §15.4):

```python
@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("2/minute")
async def delete_user_account(*, request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    # Lock this user's own row for the duration of the transaction. Every
    # table this transaction cares about (clients, api_keys, user_ai_keys,
    # subscriptions, usage_logs, organizations) has a mandatory, non-null FK
    # back to users.id — so any concurrent INSERT that references this user
    # (including tenant_context.py's self-heal creating a brand-new
    # Organization) must first acquire a FOR KEY SHARE lock on this exact
    # row, which conflicts with FOR UPDATE and blocks until we commit or
    # roll back. See §15.3 for why locking `organizations` alone is not
    # sufficient — it misses the case where no org exists yet at read time.
    locked_user = (
        db.query(User).filter(User.id == current_user.id).with_for_update().one()
    )

    org = (
        db.query(Organization)
        .filter(Organization.owner_user_id == locked_user.id)
        .with_for_update()
        .first()
    )

    if org is not None:
        other_member = (
            db.query(Membership)
            .filter(Membership.org_id == org.id, Membership.user_id != locked_user.id)
            .first()
        )
        if other_member is not None:
            # Not reachable in production today (§5: every org is solo-owned),
            # but must fail safe, not silently delete a shared org's data.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Transfer organization ownership before deleting your account",
            )

    try:
        if org is not None:
            # Step 1 — clear every row that carries this org's org_id (Layer 2).
            # Bulk `Query.delete()` issues one DELETE statement per table and
            # relies entirely on the already-declared DB-level ON DELETE
            # CASCADE for everything downstream (Project, Milestone,
            # GitHubCache, ChatHistory, ConversationState) — no ORM object
            # loading, no per-row round trips (§15.1, §15.4). UsageLog is
            # included explicitly: it carries org_id RESTRICT too, and is
            # NOT reached by deleting Client/APIKey alone if it has a null
            # api_key_id (§15.2).
            for model in (Client, APIKey, UserAIKey, Subscription, UsageLog):
                db.query(model).filter(model.user_id == locked_user.id).delete(
                    synchronize_session=False
                )
            # Bulk deletes execute immediately (they are not deferred to the
            # next flush the way `db.delete(obj)` is) — this flush is a
            # documented no-op kept as an explicit checkpoint, not a
            # dependency (§15.2).
            db.flush()

            # Step 2 — Layer 2 is now clear; the org itself can be deleted.
            # This IS a deferred ORM delete, so the flush below is load-
            # bearing: it forces `DELETE FROM organizations` to execute now,
            # rather than sharing a flush with the User delete in step 3,
            # which is the one thing §7's ordering proof depends on (§15.2).
            # Membership/Invitation rows CASCADE automatically (DB-level).
            db.delete(org)
            db.flush()

        # Step 3 — Layer 1 is now clear (org gone, or never existed). The
        # existing User cascade handles anything not already deleted above
        # (relevant only when org is None) and finally removes the user row.
        db.delete(locked_user)
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.error("Account deletion failed for %s: unhandled FK constraint", current_user.id, exc_info=True)
        raise HTTPException(500, detail="Failed to delete account")
```

This is provably correct against the full graph in §6: every `RESTRICT` edge (Layer 1, Layer 2)
is cleared before the row it points at is deleted; every `CASCADE`/`SET NULL` edge is left to
the DB, which handles it regardless of ORM awareness, in the same transaction. Nothing is
deleted outside this one `db.commit()` — if any step fails, the whole transaction rolls back and
the account is untouched (no partial deletion state is possible).

## 8. Rejecting soft delete as the primary mechanism

Reviewer's bar: soft delete is only justified by "a concrete legal, operational, or business
requirement that cannot be satisfied with a transactional hard-delete workflow." That was
checked against this project's own published commitments, not assumed:

- `PRIVACY.md:57-59`: *"Account data is retained while your account is active. You can request
  deletion at any time... We delete your data within 30 days of a deletion request."*
- `TERMS.md:71,73`: *"You can delete your account at any time... Upon termination, your data will
  be deleted within 30 days."*

**"Within 30 days" is a ceiling, not a floor — an immediate transactional hard delete satisfies
it trivially (immediate is a subset of within-30-days).** Nothing in either document requires a
delay, a soft-delete window, or a retention period. There is also no separate financial-ledger
table in the schema (`Subscription` stores gateway IDs/status/period only, not line-item
invoices; `UsageLog` is metering data, not a payment record) that would create an independent
tax/accounting retention obligation to carve out. **No requirement in this codebase or its
published policies demands soft delete.** Immediate transactional hard delete is not just
acceptable — it's the simplest way to satisfy the commitment already made to users.

Soft delete is correctly already in use exactly where it belongs — `Client.deleted_at`, an
operational "archive this record" feature for an active account (§5) — and that usage is
unaffected by this design. It should not be introduced for the terminal account-deletion path
without a concrete requirement, which does not currently exist.

## 9. Database migrations required

1. **`organizations.owner_user_id` unique constraint** (§4) — closes the documented race gap
   this transaction depends on ("the" org, singular, per user):
   `CREATE UNIQUE INDEX uq_organizations_owner_user_id ON organizations (owner_user_id)`.
2. **No new columns.** No `deleted_at`/`anonymized_at` on `users` — hard delete needs no new
   state to track.
3. **No backfill migration** — the transaction in §7 operates on live rows at request time; it
   doesn't need historical data reshaped.

## 10. API changes required

- `DELETE /api/v1/auth/me`: same route, same `204 No Content` contract, body of the handler
  replaced per §7. New possible response: `409 Conflict` when the (currently unreachable, but
  must-exist) "org has other members" guard trips — needs a documented error shape for the
  frontend even though production can't hit it today.
- No new public endpoint required. Ownership transfer (what a real user would need to do to
  resolve a `409`) is genuinely out of scope for this fix — it depends on Phase 3
  invitations/RBAC endpoints existing at all, which they don't (audit P2-1) — and is correctly
  deferred as a P1 follow-up tied to Phase 3, not to this P0.

## 11. Backward compatibility

- Response contract unchanged (`204`, no body) for every account that can delete successfully
  today — which, per this transaction, becomes *every* account, including the ones that
  currently 500.
- No new columns, so no new query-site sweep is required (unlike the rejected soft-delete
  design, which would have required auditing every `db.query(User)` call site for a
  `deleted_at IS NULL` filter). This is a direct complexity reduction the reviewer's critique
  correctly predicted.
- The one known orphaned test row (`audit-e2e-1785064129@example.com`,
  `d04a6e28-249e-4297-ab43-e75dfcbd3a3f`) is cleaned up by calling the fixed endpoint against it
  directly (§12) — a real, physical delete, not a data migration.

## 12. Production rollout plan

1. **Migration** — add the `owner_user_id` unique index (§9.1). Purely additive; safe to deploy
   alone. Verify no existing duplicate `owner_user_id` rows would violate it first
   (`SELECT owner_user_id, COUNT(*) FROM organizations GROUP BY owner_user_id HAVING COUNT(*) > 1`)
   — expected zero rows, but must be confirmed before adding a constraint that would otherwise
   fail to apply.
2. **Code deploy** — ship the rewritten `delete_user_account` (§7). Current production behavior
   is "500, completely broken," so there is no working behavior to regress; no feature flag
   needed.
3. **Verify** against the exact two-layer repro from the audit: register → create client →
   create project → `DELETE /me` → expect `204`; confirm via direct query that the `users`,
   `organizations`, `clients`, `projects`, `memberships` rows are actually gone (not just that
   the endpoint returned success).
4. **Dogfood cleanup** — run the fixed endpoint against the one known orphaned audit test account
   to confirm real-world correctness and close out that residual item from the audit.
5. **Monitor** Cloud Run logs for `IntegrityError` on this route for the first ~30 minutes after
   deploy — the only way this transaction fails is an FK path this document missed, and the
   catch block now logs full context (`current_user.id`, `exc_info=True`) specifically to make
   that fast to diagnose if it happens.

## 13. Rollback plan

- The migration (§9.1) is additive and non-destructive; if it somehow needs reverting,
  `DROP INDEX uq_organizations_owner_user_id` is safe and instant.
- The code change has no data-migration dependency, so rollback is a plain Cloud Run revision
  rollback to the prior known-good revision (`voxly-backend-00017-llb`). Because §7's transaction
  either fully commits or fully rolls back (standard DB transaction semantics — no soft-delete
  intermediate state, no async worker, no eventual consistency), there is no partial-deletion
  state that a code rollback could strand. This is a direct structural benefit of rejecting the
  soft-delete/async-purge design: there is exactly one system, one transaction, one commit point,
  so rollback has nothing extra to reason about.

## 14. Tests that must be added

- `DELETE /me` returns `204` for a user with no organization (flag off / self-heal never
  triggered) — baseline regression guard, matches today's only passing case.
- `DELETE /me` returns `204` (not 500) for a user with an auto-created personal `Organization`
  and zero clients/projects — the exact Layer-1 repro.
- `DELETE /me` returns `204` (not 500) for a user whose org has clients *and* projects with
  `org_id` populated — the exact Layer-2 repro (the case a naive Layer-1-only fix would still
  fail).
- After deletion, assert by direct query (not just the HTTP response) that `users`,
  `organizations`, `clients`, `projects`, `milestones`, `github_cache`, `chat_history`,
  `conversation_states`, `api_keys`, `usage_logs`, `user_ai_keys`, `subscriptions`, and
  `memberships` rows for that user/org are all actually gone — every edge in §6's graph gets a
  positive assertion, not just an absence of errors.
- `409` returned, and **nothing deleted**, when the org has another `Membership` (construct this
  directly against the DB in the test, since no invitation flow exists yet to reach it via the
  API) — proves the guard fires and the transaction didn't partially commit before hitting it.
- Concurrent-request race: a `POST /clients` issued mid-deletion (after the org row-lock is
  acquired) either blocks until the deletion transaction completes and then legitimately 404s/
  401s (account gone), or the deletion transaction observably waits for it — never a state where
  a new client is created with an `org_id` pointing at an already-deleted organization.
- Rate limit (`2/minute`) on `/me` DELETE still enforced after the rewrite.
- **Must run against real Postgres, not the default in-memory SQLite.** `backend/tests/
  conftest.py:23-34` falls back to `sqlite:///:memory:` with no `PRAGMA foreign_keys=ON`
  listener configured, so SQLite silently does not enforce any of the FK constraints this whole
  bug class depends on — the same gap that already caused one prior CI escape on this project
  (`test_to_github_stats_maps_real_fields`). All tests above must run in the Postgres-backed CI
  lane (`DATABASE_URL` set) or they will pass locally and still ship broken.

---

## 15. Pre-implementation analysis

Four questions requested before writing code. Each is answered from the actual schema/ORM
configuration and documented Postgres/SQLAlchemy semantics, not asserted.

### 15.1 — Could FK cascades / relationship configuration eliminate the manual deletes?

**No, not for the RESTRICT edges — and that's by design, not a gap.** `passive_deletes` and
`cascade="all, delete-orphan"` are ORM configuration for relationships backed by `CASCADE` (or
`SET NULL`) at the DB level: they change *how* SQLAlchemy processes an already-automatic
DB-level action (load-and-delete each child in Python, vs. trust Postgres to cascade it
natively). They cannot change what a `RESTRICT` constraint does, because `RESTRICT` means "the
database refuses until a human (or application) deals with it" — that is the entire point of the
constraint, not an ORM limitation. `Client.org_id`, `Project.org_id`, `APIKey.org_id`,
`UserAIKey.org_id`, `Subscription.org_id`, `UsageLog.org_id`, and `Organization.owner_user_id`
are all `RESTRICT`. Manual, explicit clearing before the referenced row is deleted remains
structurally required as long as those stay `RESTRICT` — and they should stay `RESTRICT`: once
Phase 3 ships multi-member orgs, `CASCADE` on `org_id` would mean one member deleting their
account silently deletes every other member's clients and projects. `RESTRICT` is the correct
safety property; it just means this deletion can't be automatic.

One relationship-graph alternative was considered directly: declare `Organization.clients`,
`.projects`, `.api_keys`, etc. as real relationships (they don't exist today — `organization.py`
only declares `owner` and `memberships`) so SQLAlchemy's dependency sort could compute the
Layer-2-before-Layer-1 ordering itself. Rejected: this adds six new ORM relationships whose only
purpose would be making cascade-ordering implicit for one endpoint, for columns that (§5) are not
consulted by any read path today. That's more surface area and more ways to get it subtly wrong,
not less — the explicit procedural version in §7 is auditable line-by-line; a six-relationship
graph change is not something you can visually verify walks the graph in the right order.

**What the ORM cascade configuration *is* worth changing:** the already-correct, already-working
`User → Client/APIKey/UserAIKey/Subscription/UsageLog` cascade (`cascade="all, delete-orphan"`,
no `passive_deletes`) currently makes SQLAlchemy `SELECT` every child row into Python before
deleting it, one row at a time, whenever `db.delete(user)` is called anywhere. §15.4 covers why
that matters and what the fix (bulk `Query.delete()`, bypassing the ORM cascade for this endpoint
specifically) looks like in practice — it makes the `passive_deletes` question moot for *this*
transaction, because step 1 no longer goes through the ORM cascade path at all.

### 15.2 — Why does every `db.flush()` exist; what breaks if removed?

This forced a real correction, not just an explanation. The transaction has two kinds of delete
calls with different execution timing, and mixing them up is exactly the kind of mistake this
question is designed to catch:

- **Bulk `Query.delete(synchronize_session=False)`** (step 1) executes its `DELETE` statement
  **immediately**, as part of the `.delete()` call itself — not deferred to a flush. So the
  `db.flush()` after step 1 is, in practice, a no-op: there is nothing pending to flush. It is
  kept anyway as an explicit checkpoint, so step 1's completion doesn't silently depend on bulk
  `.delete()`'s immediate-execution behavior remaining implementation-defined truth forever — if
  a future edit swapped one of those bulk deletes for an ORM-tracked `db.delete(obj)`, the
  flush's presence means the ordering guarantee wouldn't silently break.
- **`db.delete(org)`** (step 2) is a normal ORM delete: it marks the object pending, and issues
  no SQL until the next flush. **This flush is load-bearing.** Removing it would leave `org`'s
  pending `DELETE FROM organizations` sitting in the same session state as step 3's
  `db.delete(locked_user)` — both would land in *one* flush when `db.commit()` (which flushes
  first) runs. SQLAlchemy's unit-of-work does topologically sort a flush's pending operations,
  but it does so primarily from the *declared relationship graph*; there is no `relationship()`
  connecting `Organization` and `User` with delete-order semantics (`Organization.owner` has no
  cascade configured at all). Relying on the flush's internal statement-ordering to happen to put
  `organizations` before `users` anyway would be relying on undocumented behavior — precisely
  what §7 already rejected once for the "add a cascade relationship" alternative. The explicit
  flush after `db.delete(org)` removes that dependency entirely: it forces the `DELETE FROM
  organizations` statement to execute and succeed *before* `db.delete(locked_user)` is even
  called, so the order Postgres sees is a direct, provable consequence of the code's control
  flow, not of SQLAlchemy's internal sort order.

**Bug this caught:** the first draft of §7 said "`UsageLog` rows CASCADE at the DB level from
both `user_id` and `api_key_id` — no explicit delete needed." That's true *eventually*, but only
once `User` or `APIKey` is actually deleted — and in this transaction, `Organization` (step 2) is
deleted *before* `User` (step 3). A `UsageLog` row with `user_id` set but `api_key_id` NULL
(usage not tied to a specific key — a real, valid state per the model) still has `org_id`
pointing at this org at the moment step 2 runs, and `usage_logs.org_id` is `RESTRICT`
(`usage_log.py:16`). The original draft would have failed Layer 2 on exactly this row shape.
Fixed by adding `UsageLog` to step 1's explicit clear list. This is the concrete answer to "what
would happen if a flush were removed" turned into "what happens if a table is *silently assumed
covered* instead of explicitly covered" — same failure mode, worse: it wouldn't show up until a
production account had a `UsageLog` row with no `api_key_id`, which is entirely plausible and
was not exercised by the original repro.

### 15.3 — Does `FOR UPDATE` fully prevent concurrent org-referencing inserts? Which tables, which transaction?

**Locking `organizations` alone: no — there's a real gap.** `FOR UPDATE` locks an existing row.
It cannot protect against a concurrent transaction *creating a brand-new* `Organization` row for
this user, because there's nothing to lock until that row exists. Concretely: if `org` is `None`
at read time (a user deleting their account in the same instant as their very first tenant-scoped
request — narrow, but real), a concurrent `POST /clients` could run `resolve_tenant_context`'s
self-heal (`tenant_context.py:93-106`) and `INSERT` a fresh `Organization` with
`owner_user_id = locked_user.id` after our transaction already decided "no org exists." If that
commits before our `DELETE FROM users`, our deletion hits Layer 1 and fails safe (500, no
corruption, just needs a retry) — not silent data loss, but not clean either.

**Locking the `users` row closes this completely, and is provably sufficient — not asserted, but
derived from documented Postgres locking rules.** PostgreSQL's row-level locking
(`FOR UPDATE`/`FOR KEY SHARE`) is specifically designed to make FK referential-integrity checks
safe under concurrency: any `INSERT` (or `UPDATE`) that sets a foreign key column must acquire a
`FOR KEY SHARE` lock on the row it references, and `FOR UPDATE` conflicts with every other
row-lock mode, including `FOR KEY SHARE`. Every table this transaction touches has a mandatory
FK back to `users.id` — `Client.user_id`, `APIKey.user_id`, `UserAIKey.user_id`,
`Subscription.user_id`, `UsageLog.user_id` (all `NOT NULL`), and `Organization.owner_user_id`
(`NOT NULL`). So locking `users` with `FOR UPDATE` at the very start of the transaction (added in
§7's revised code) blocks *every* concurrent insert into *every* one of those tables for this
user — including the self-heal race above, which locking `organizations` alone could never catch
since it fires before an `Organization` row exists.

The lock on `organizations` (kept in addition, in §7's code) is then genuinely redundant for
race-prevention — the `users` lock already covers it, since an `Organization` insert also
requires a `FOR KEY SHARE` lock on the referenced `users` row — but it's kept anyway because it's
free and makes the 409 "other members" check's intent explicit at the call site (lock what you're
about to read-then-branch-on).

### 15.4 — Performance at scale (50k clients, 200k chat-history rows, millions of usage logs)

**The ORM-per-object-iteration version in the first draft would not survive this.**
`for client in db.query(Client).filter(...): db.delete(client)` loads every `Client` into Python,
and each one's declared cascade (`Client.projects`, `.chat_history`, `.conversation_state`) then
triggers additional `SELECT`s and individual `DELETE`s per child, recursively — for 50k clients
each with a handful of projects and each project with dozens of chat rows, that's easily
hundreds of thousands of individual round-trips issued serially by the ORM, all while holding the
`FOR UPDATE` lock from §15.3 — realistically minutes to hours, almost certainly exceeding the
request timeout, and blocking every other operation for that user in the meantime.

**The bulk `Query.delete(synchronize_session=False)` version in the revised §7 avoids this
entirely for the structural data.** `db.query(Client).filter(Client.user_id == id).delete(...)`
is one SQL statement — `DELETE FROM clients WHERE user_id = :id` — and Postgres executes the
entire downstream cascade (`Project`, `Milestone`, `GitHubCache`, `ChatHistory`,
`ConversationState`) natively, inside that one statement, with zero round-trips back to the
application. Same for `APIKey`/`UserAIKey`/`Subscription`/`UsageLog`. This is the standard
technique for bulk-deleting cascading data and is what's actually implemented.

**Where a real future scaling seam exists, honestly:** a single unbounded `DELETE FROM
usage_logs WHERE user_id = :id` cascading through genuinely millions of rows is a long-running
statement — it holds locks, generates a large volume of WAL, and could itself approach a request
timeout at extreme scale (metering data is the one table here realistically capable of reaching
that volume for a single long-lived heavy user; `Client`/`Project`/`ChatHistory` counts stay
naturally bounded by how many clients one agency actually manages). The standard mitigation, if
and when this becomes real, is chunked deletion of `usage_logs` specifically (`DELETE ... WHERE
user_id = :id LIMIT 10000` in a loop) — but that reintroduces multi-statement complexity for a
scale this product is nowhere near today. **Not implemented now** — flagged as the specific,
named seam to revisit if usage volume ever grows into that range, rather than speculatively
batching a table that today holds a few dozen rows per user.

---

**No code has been modified in this document.** Implementation follows in small, reviewable
commits: (1) the `organizations.owner_user_id` unique-index migration, (2) the rewritten
`delete_user_account`, (3) the Postgres-backed integration tests from §14.
