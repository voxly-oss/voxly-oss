# Phase 1 (Milestones 1–3) Rollout Plan

> **Status:** Approved for execution, step by step. Nothing in this plan has been executed yet.
> **Scope:** Deploying the Organization/Role/Membership/Invitation schema (Milestone 1), backfilling existing users (Milestone 2), and activating dual-write (Milestone 3) in production.
> **Not in scope:** Any code change. This is an operational document only.

## System reference (ground truth for every command below)

| Component | Value |
|---|---|
| GCP project | `voxly-491010` |
| Region | `us-central1` |
| Cloud Run service | `voxly-backend` |
| Prod URL | `https://voxly-backend-703348211297.us-central1.run.app` |
| Database | Supabase Postgres (Mumbai), via pooler `aws-1-ap-south-1.pooler.supabase.com:5432` |
| Redis | Upstash `moving-cricket-45660.upstash.io:6379` |
| Frontend | Vercel `voxly-oss.vercel.app` (unaffected by this rollout — no frontend changes) |
| Env var source | `backend/env.yaml` (gitignored; must be manually kept in sync before each deploy) |
| Migration chain | `a1b2c3d4e5f6` (current prod head) → `c1f7825d5a5d` (Milestone 1) → `01abb4f68454` (Milestone 2 expand) |
| Backfill tool | `python -m app.scripts.backfill_organizations` (`--dry-run` / `--verify` / `--rollback` / `--yes` / `--batch-size` / `--chunk-size`) |
| Feature flags | `DUAL_WRITE_ORGANIZATIONS_ENABLED` (default `False`), `DUAL_READ_SHADOW_VERIFY_ENABLED` (default `False`) |

**One operational fact that shapes the whole plan:** `backend/Dockerfile` currently runs `alembic upgrade head` as a **non-fatal** container-startup step (`|| echo 'skipped'`). That means the normal deploy path does *not* reliably gate on migrations succeeding. For this rollout, migrations are run as an explicit, manually-verified step — never assume the container start silently handled it.

**No staging environment is confirmed to exist** for this service today. This plan is written to be safe to execute directly against production (every step is additive, idempotent, and independently reversible) — but if a staging/preview Cloud Run service is available when you execute this, run Phases 1–5 there first.

---

## 1. Deployment sequence

The guiding principle: **deploy code before touching schema, and keep flags off until data is verified.** At every intermediate point below, the running system must be well-defined on its own:

```
old code + old schema                → today's prod (baseline)
new code (flags off) + old schema    → safe: no Milestone 1-3 code path touches the DB unless flags are on
new code (flags off) + new schema    → safe: new tables/columns sit unused
new code (flags off) + backfilled DB → safe: backfilled org_id values sit unused
new code (flags ON)  + backfilled DB → dual-write is now live
```

### Phase A — Pre-flight (no changes made)
- [ ] Record the current Cloud Run revision ID for `voxly-backend` (this is the rollback target for Layer 2 in §5)
- [ ] Confirm `backend/env.yaml` does **not** set `DUAL_WRITE_ORGANIZATIONS_ENABLED` or `DUAL_READ_SHADOW_VERIFY_ENABLED` — their absence defaults both to `False`
- [ ] Confirm the full test suite passes on the exact commit being shipped (last known state: 90/90)
- [ ] Confirm `requirements.txt` contains the `bcrypt<4.1,>=4.0` pin
- [ ] Confirm Supabase's automatic backup/PITR window covers this rollout window (this is the real data-safety net behind §5 Layer 3/4 — a manual snapshot is worth taking if you want an explicit restore point)
- [ ] If a staging Cloud Run service exists: deploy there and run Phases B–F fully before repeating against production

### Phase B — Application code deploy (flags stay OFF)
- [ ] `gcloud run deploy voxly-backend --source ./backend --project voxly-491010 --region us-central1` (env vars unchanged from current prod)
- [ ] `GET /health` returns 200
- [ ] Smoke test on an existing account: login, list clients, view a project — confirms zero regression
- [ ] This step alone already fixes two live production bugs, independent of everything else in this plan: the `bcrypt`/`passlib` incompatibility that broke all API-key creation, and the UUID-vs-string comparison bug in the billing webhook handlers and `usage_tracker.py`

### Phase C — Database migration
See §2.

### Phase D — Backfill
See §3.

### Phase E — Verification gate
See §4. Do not proceed to Phase F until this is fully green.

### Phase F — Feature flag activation
See §6.

---

## 2. Database migration sequence

Two Alembic revisions, both additive-only (new tables, nullable columns), both transactional (a failure mid-migration auto-rolls back — no partial-apply risk):

- **`c1f7825d5a5d`** — `organizations`, `roles`, `memberships`, `invitations` tables; nullable `org_id` on `clients`, `subscriptions`, `api_keys`, `usage_logs`, `user_ai_keys`; seeds 5 system roles (owner/admin/member/billing/viewer).
- **`01abb4f68454`** — nullable `org_id` on `projects`.

### Steps
- [ ] Confirm `DATABASE_URL` in the executing environment points at the prod Supabase pooler (`aws-1-ap-south-1.pooler.supabase.com`), not a local/dev database
- [ ] `alembic current` → confirm it shows `a1b2c3d4e5f6` (today's prod head) before proceeding
- [ ] `alembic history` → confirm the chain resolves cleanly to `01abb4f68454` as the new head (already verified during development; re-verify against the live DB's recorded version)
- [ ] `alembic upgrade head` — applies both revisions in one command
- [ ] `alembic current` → confirm it now shows `01abb4f68454`
- [ ] Confirm new tables exist: `organizations`, `roles` (expect exactly 5 rows), `memberships`, `invitations` (expect 0 rows)
- [ ] Confirm new nullable columns exist: `clients.org_id`, `subscriptions.org_id`, `api_keys.org_id`, `usage_logs.org_id`, `user_ai_keys.org_id`, `projects.org_id`
- [ ] Confirm row counts on every pre-existing table are unchanged from immediately before the migration
- [ ] Re-run the Phase B smoke test — should be a complete non-event (flags are still off, so no code path queries the new tables yet); any deviation here signals a problem with the migration or deploy itself, not with dual-write

---

## 3. Backfill execution plan

Uses `app/scripts/backfill_organizations.py` — idempotent and restart-safe by design; safe to interrupt and rerun at any point.

- [ ] `python -m app.scripts.backfill_organizations --dry-run` — review the pre-flight summary (users to process, orgs/memberships to create, rows to update per table, estimated time). Given this system's current dogfooding-stage scale, expect small numbers; if the numbers are surprisingly large, stop and investigate before proceeding.
- [ ] Run for real: `python -m app.scripts.backfill_organizations` (interactive; re-prints the summary and requires explicit confirmation) — run from an operator machine with direct DB access, not from inside the Cloud Run container
- [ ] Watch the per-batch progress log (`... processed N users so far`)
- [ ] Confirm the final summary (users processed / orgs created / memberships created / rows stamped per table) is consistent with the dry-run estimate (it may be slightly higher if new signups landed mid-run — that's expected and fine)
- [ ] `python -m app.scripts.backfill_organizations --verify` — the authoritative pass/fail signal. Checks: zero rows with `org_id IS NULL` across all 6 tables; zero users without an owned organization; zero organizations missing an owner membership.
- [ ] If `--verify` reports any FAIL, do **not** proceed to Phase F. Re-running the backfill is always safe — investigate the specific failing check, fix the underlying cause, and rerun.
- [ ] Re-run the Phase B smoke test once more — backfill only writes to tables the running app isn't querying yet with flags off, so this should also be a non-event.

**Restart-safety reminder:** if the backfill is interrupted at any point (Ctrl+C, connection drop, machine restart), simply rerun the same command. Every step (org lookup-by-owner, membership lookup-by-org+user, per-table `org_id IS NULL` stamping) is idempotent and resumes automatically from wherever it left off.

---

## 4. Verification checklist (go/no-go gate before touching flags)

- [ ] `alembic current` = `01abb4f68454`
- [ ] `roles` table has exactly the 5 expected system roles with expected names and permission sets
- [ ] `python -m app.scripts.backfill_organizations --verify` passes on all checks
- [ ] Spot-check 2–3 real accounts manually: each has exactly one `Organization` (`owner_user_id` = their id), exactly one `Membership` (`role=owner`, `status=active`), and all of their `clients`/`projects`/`subscriptions`/`api_keys`/`usage_logs`/`user_ai_keys` rows have `org_id` matching that org
- [ ] `organizations.slug` values look sane (no garbage, no collisions) — spot-check a handful
- [ ] Application health (error rate, latency, Cloud Run instance health) is unchanged from the pre-migration baseline — since flags are still off, any deviation here is a signal about the deploy/migration itself, not about dual-write
- [ ] Confirm you understand and are ready to execute §5 if needed (readiness check, not an action)

Only proceed to §6 once every item above is checked.

---

## 5. Rollback checklist

Organized by layer, cheapest/safest first. **Always try Layer 1 before escalating.** Layers 3 and 4 are the only genuinely hard-to-reverse actions in this plan — do not reach for them unless Layers 1–2 have been tried and did not resolve the issue.

### Layer 1 — Feature flags (use this first for anything dual-write-behavior-related)
- [ ] Set `DUAL_WRITE_ORGANIZATIONS_ENABLED=False` (and `DUAL_READ_SHADOW_VERIFY_ENABLED=False` if it was on) in Cloud Run env vars and redeploy (env-var-only change; no rebuild)
- [ ] Any `org_id` values already written while the flag was on are harmless and stay in place — nothing needs to be undone
- [ ] This resolves essentially any dual-write-behavior problem within one redeploy cycle

### Layer 2 — Application code
- [ ] Roll back to the Cloud Run revision recorded in Phase A: `gcloud run services update-traffic voxly-backend --to-revisions <previous-revision>=100`
- [ ] Safe regardless of migration/backfill state — the old code never reads the new tables/columns either

### Layer 3 — Backfill data
- [ ] `python -m app.scripts.backfill_organizations --rollback` — nulls `org_id` on all 6 tables, deletes all `memberships`, deletes all `organizations`
- [ ] **Hard constraint:** this is a blanket rollback and is only safe **before** Phase F (flag activation) has ever run in production. Once dual-write has been live, some organizations may have been created organically (not just by backfill), and this blanket rollback would destroy those too.
- [ ] If rollback is needed *after* Phase F has run: do **not** run `--rollback`. This scenario needs a rollback scoped by timestamp or by the specific affected users — that tooling does not exist yet. Stop and design the scoped rollback before executing anything.

### Layer 4 — Schema
- [ ] `alembic downgrade a1b2c3d4e5f6` — drops `projects.org_id`, then the Milestone 1 tables/columns entirely
- [ ] Only safe if Layer 3 has already been executed (or backfill was never run) — do not drop columns that still hold meaningful data
- [ ] This is the full revert to pre-Milestone-1 state; treat as a last resort

---

## 6. Feature flag activation checklist

- [ ] Re-confirm §4 is fully green
- [ ] Pick a window you can personally watch (given current scale, this matters more than picking an "off-peak" hour in the traditional sense)
- [ ] Activate **`DUAL_WRITE_ORGANIZATIONS_ENABLED=True` only** — leave `DUAL_READ_SHADOW_VERIFY_ENABLED=False` for now; it's a separate, later, lower-urgency step (see below)
- [ ] Deploy the env-var-only change (new Cloud Run revision)
- [ ] Immediately smoke test as the operator: register a new test account → confirm an `Organization` + owner `Membership` are created; create a client/project/api-key/ai-key → confirm each gets `org_id` stamped; check logs for the expected self-heal log line
- [ ] Watch logs closely per §7 for the first active window
- [ ] Soak for an initial period (recommend at least 24–48h of real traffic, or long enough for every one of the six wired write paths to be exercised at least once by real usage) before considering it settled
- [ ] Only after §8's criteria are met for `DUAL_WRITE_ORGANIZATIONS_ENABLED`, separately consider activating `DUAL_READ_SHADOW_VERIFY_ENABLED=True` as its own follow-up step (own deploy, own monitoring window). This flag exists purely to build confidence for a *future* read cutover — it is not required for Milestone 3 itself to be considered complete.

---

## 7. Production monitoring checklist

**No `/metrics` endpoint or Prometheus/OTel integration exists yet** (a deliberate scope decision — see the Milestone 3 design). Monitoring today is log-based, via Cloud Logging.

- [ ] Watch for resolution failures (expect zero or near-zero):
  ```
  gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="voxly-backend" AND textPayload:"tenant_resolution_failure_count"' --project=voxly-491010 --limit=50
  ```
  A sustained non-zero rate is a signal to pause and investigate — consider Layer 1 rollback if it doesn't self-resolve quickly.

- [ ] Watch self-heal activity:
  ```
  gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="voxly-backend" AND textPayload:"Tenant self-heal"' --project=voxly-491010 --limit=50
  ```
  Expect a small burst right after activation (any edge cases backfill didn't catch), tapering to near-zero. Sustained non-trivial self-heal activity after the initial window suggests either the backfill missed users or new-signup org-creation isn't reliably firing at registration — worth investigating even though it's self-healing by design.

- [ ] General app health: Cloud Run 5xx rate and p50/p95 latency on the six wired write endpoints (`POST /clients`, `/projects`, `/api-keys/`, `/api-keys/{id}/rotate`, `/ai-keys/`, `/auth/register`) vs. the pre-activation baseline. A small latency bump is expected (one extra indexed DB lookup per write in the common case); a large one is not.

- [ ] Watch for `PendingRollbackError` or other SQLAlchemy session-state errors — would indicate the narrow, documented "genuine resolution failure requiring rollback" edge case in `resolve_tenant_context` is firing more than expected.

- [ ] Confirm no 500-rate increase on `/auth/register`, `/auth/google`, `/auth/github/callback` specifically — registration failures are the highest-visibility, highest-cost failure mode of this rollout.

- [ ] **Known gap to monitor for directly:** `organizations.owner_user_id` has no unique constraint yet (an accepted, documented trade-off from the Milestone 3 design). Periodically run:
  ```sql
  SELECT owner_user_id, COUNT(*) FROM organizations GROUP BY owner_user_id HAVING COUNT(*) > 1;
  ```
  Any results indicate a concurrency race created a duplicate org for one user. Expected to be rare at current traffic levels, but this is the concrete query to catch it if it happens.

- [ ] Periodically (weekly, or after any burst of new signups) re-run `python -m app.scripts.backfill_organizations --verify` against prod as a standing correctness check — it's idempotent and safe to run repeatedly, not just as a one-time gate.

- [ ] Track `organizations`/`memberships` row-count growth vs. `users` row-count growth — they should move 1:1 going forward. Divergence signals either the duplicate-org race above or a webhook/background write path not resolving tenant context correctly.

---

## 8. Success criteria for enabling Milestone 4

Milestone 4's exact scope hasn't been defined yet. These criteria describe the preconditions dual-write needs to satisfy before building anything further on top of it — whatever Milestone 4 turns out to be, it will assume `org_id` coverage is reliable, so these are the signals that assumption actually holds:

- [ ] `DUAL_WRITE_ORGANIZATIONS_ENABLED=True` has been live in production for a sustained period (recommend 1–2 full weeks minimum, or long enough to cover a typical usage cycle for this user base) with no rollback
- [ ] A fresh `python -m app.scripts.backfill_organizations --verify` run passes cleanly — confirms `org_id` coverage is effectively 100% across both backfilled and newly-created data
- [ ] `tenant_resolution_failure_count` has stayed at zero (or every occurrence has been individually explained) for the full soak period
- [ ] Self-heal activity has flattened to zero for existing users — proves the backfill was complete and self-heal isn't being relied on as an ongoing crutch. New-signup self-heal firing at registration time is expected and fine; existing users needing self-heal on a later write is not.
- [ ] No duplicate-organization races detected via the `owner_user_id GROUP BY` check
- [ ] No user-visible incidents, support requests, or data inconsistencies attributable to this rollout
- [ ] If `DUAL_READ_SHADOW_VERIFY_ENABLED` was activated as a follow-up: zero (or fully explained) shadow-read mismatches over a meaningful sample window — this is the strongest available signal that `org_id`-scoped reads would return identical results to today's `user_id`-scoped reads, which is the actual precondition for ever cutting real reads over
- [ ] Every one of the six dual-write-wired tables shows `org_id` populated on effectively every row created since activation (the same verification queries as the backfill gate, scoped to `created_at > activation_timestamp`)
- [ ] The rollback plan (§5) either wasn't needed, or was needed once and executed successfully with lessons captured
- [ ] Only after all of the above: revisit `docs/TARGET_ARCHITECTURE.md`'s Phase 2 design (tenant access layer + RLS) to scope what Milestone 4 concretely is — building it on unreliable `org_id` coverage would be building on sand.
