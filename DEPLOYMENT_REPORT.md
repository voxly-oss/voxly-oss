# Deployment Report — Phase 2 Milestone 3 + Phase 3 Milestones 1–5

**Date:** 2026-07-26
**Executed by:** Claude Code, per explicit approval ("Approved. Execute Steps 1–3.")
**Scope:** 3 pending Alembic migrations + one Cloud Run deploy, bringing production up to date with 9 previously-committed-but-undeployed backend commits.

---

## 1. Pre-deployment state (confirmed, not assumed)

| Check | Result |
|---|---|
| Cloud Run revision before deploy | `voxly-backend-00016-xnn` (from Phase 1's secret rotation — nothing had shipped since) |
| Production `alembic_version` before migrating | `01abb4f68454` |
| Local test suite (pre-flight, re-run immediately before migrating) | 232/232 passed |
| Database reachable | Yes — Postgres 17.6 via Supabase pooler |

## 2. Restore points created

1. **Full logical database backup** — `pg_dump` (plain SQL, `--no-owner --no-acl`) taken immediately before migrating. 50 tables, 221 KB, 6,523 lines. Stored at:
   `.../scratchpad/prod_backup_pre_phase3_migrations_20260726T130730.sql`
   Restore procedure if ever needed: `psql "$DATABASE_URL" < prod_backup_pre_phase3_migrations_20260726T130730.sql` (into a fresh/cleared schema).
   Not committed to git (contains production data).
2. **Cloud Run revision** `voxly-backend-00016-xnn` — immutable, still exists, instant rollback via `gcloud run services update-traffic voxly-backend --to-revisions voxly-backend-00016-xnn=100 --region us-central1 --project voxly-491010`.
3. **Migration downgrade path** — each of the 3 migrations has a tested `downgrade()`; `alembic downgrade 01abb4f68454` returns the schema to its exact pre-deployment state.

## 3. Migration versions applied

Applied in one `alembic upgrade head` run, in dependency order:

| Order | Revision | Description | Type |
|---|---|---|---|
| 1 | `f3a9c2e7b481` | Add `deleted_at` (+ index) to `milestones` | Additive column |
| 2 | `a7e4d19c6f52` | Add `conversation_states` table | New table |
| 3 | `d29b6f814c3e` | Add `confidence`, `sentiment`, `language`, `ai_response_time_ms` to `chat_history` | Additive columns |

**Post-migration verification (all passed):**
- `alembic current` → `d29b6f814c3e (head)` ✅
- `milestones.deleted_at` exists ✅
- `conversation_states` table exists ✅
- `chat_history.confidence` / `.sentiment` / `.language` / `.ai_response_time_ms` all exist ✅
- `GET /health` → `200` (checked immediately after migrating, while still running pre-deploy code — confirms the migration itself didn't disrupt the then-live service) ✅

No backfill required for any of the three (all nullable/new, no historical data to populate — as documented in each migration's own commit).

## 4. Cloud Run deployment

- Command: `gcloud run deploy voxly-backend --source ./backend --region us-central1 --project voxly-491010`
- Source: current `develop` HEAD (`d307aaf`) — 9 commits: the cache-service fix, Phase 2 Milestones 2–4 (Projects GitHub stats, Milestones soft-delete, Channels), and Phase 3 Milestones 1–5 (Conversation State, Metadata, APIs, Realtime, GitHub Context).
- **New revision:** `voxly-backend-00017-llb`, serving **100%** of traffic.
- Revision status: `Ready = True`.

## 5. Smoke test results

| Test | Result |
|---|---|
| `GET /health` | `200 {"status":"healthy"}` |
| Auth guard: `GET /chat/history/{id}` | `401` |
| Auth guard: `GET /chat/messages` | `401` |
| Auth guard: `GET /chat/conversations` | `401` |
| Auth guard: `GET /chat/conversations/{id}/status` | `401` |
| Auth guard: `PATCH /chat/conversations/{id}/status` | `401` |
| Auth guard: `GET /clients`, `/projects`, `/milestones`, `/channels` | `401` each |
| `WS /chat/ws?token=bad-token` | `403` at handshake (rejected, as expected) |
| OpenAPI schema — `ChatHistoryResponse`, `ConversationSummaryResponse`, `ChatMessageResponse`, `ConversationStateResponse` all carry their new fields (`github_stats`, `status`, `ai_response`, `confidence`, `sentiment`, `language`, `ai_response_time_ms`, `updated_by_user_id`) | All present |
| `GET /conversations` and `GET /channels` routes registered in live OpenAPI spec | Both present |

All smoke tests passed. No authenticated end-to-end test was run (no real user credentials available to this session) — auth-guard + schema-shape verification was the applicable check, consistent with every prior milestone's smoke-test approach this phase.

## 6. Log summary (30-minute post-deploy window, `severity>=WARNING`)

- **0** entries at `ERROR` severity or above.
- **0** requests with HTTP status ≥ 500.
- **11** entries at `WARNING` — all individually inspected:
  - **10** are the smoke tests from §5 above (Cloud Run's request logger classifies 4xx/403 as `WARNING` by default) — expected, self-caused, not anomalies.
  - **1** is a real, routine unauthenticated request: `GET /api/v1/auth/me` → `401`, referer `https://voxly-oss.vercel.app/`, a live browser with no/expired session token hitting the auth-check endpoint — normal frontend behavior, unrelated to this deployment.
- Revision confirmed still `Ready`, still serving 100% of traffic, `/health` re-checked green at the end of the window.

**No crash loops, no anomalies, no unexplained errors.**

## 7. Rollback readiness

| Layer | Rollback action | Risk if invoked |
|---|---|---|
| Application code | `gcloud run services update-traffic voxly-backend --to-revisions voxly-backend-00016-xnn=100 --region us-central1 --project voxly-491010` | None — instant, traffic-only, revision still exists |
| Database schema | `alembic downgrade 01abb4f68454` (drops the 4 new `chat_history` columns, the `conversation_states` table, and `milestones.deleted_at`) | Low — all 3 migrations are purely additive; downgrading loses only data written to the new columns/table since deploy (none expected yet, this early) |
| Full restore | `psql < prod_backup_pre_phase3_migrations_20260726T130730.sql` | Last resort only — not needed, not used |

Not invoked. Not required. Documented for completeness per your instruction.

## 8. Production status

**Healthy.** `voxly-backend-00017-llb` serving 100% of traffic, schema at `d29b6f814c3e` (head), zero errors in the post-deploy observation window. Phase 2 (Clients/Projects/Milestones/Channels) and Phase 3 Milestones 1–5 (Conversation State/Metadata/APIs/Realtime/GitHub Context) are now fully live in production, matching what was previously only tested locally.

**Unchanged by this deployment:** the frontend (`voxly-oss.vercel.app`) — not touched, not redeployed, confirmed still serving real traffic against the new backend without incident during the observation window.

---

**Deployment milestone complete.** Stopping here per your instruction — not beginning Milestone 6 (Conversation Performance).
