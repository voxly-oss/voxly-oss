# Phase 2 Implementation Plan — Clients, Projects, Milestones, Channels

**Status:** All 4 milestones implemented, tested, and committed as of 2026-07-25 (`14087e3`, `42f6e16`, `b86fb76`, `ef6b0fb`). **Not yet deployed** — Milestones 2-4 deploy together once Phase 2 is fully approved, per explicit instruction; the Milestone 3 migration has not been applied to production yet either.
**Source of truth this plan builds on:** `BACKEND_IMPLEMENTATION_PLAN.md` (§4, §6), re-verified directly against current code on 2026-07-25 (see file/line references throughout).
**Stack note:** this is a SQLAlchemy + Alembic backend, not Prisma — migrations below are Alembic revisions, not Prisma schema changes.
**Implementation order:** Clients → Projects → Milestones → Channels, per your instruction. This order is also the correct dependency order: Channels reads from Clients (and, for volume/activity, from `chat_history` which is keyed off `client_id`); Milestones reads from Projects; Projects reads from Clients.

---

## 0. Cross-Cutting Facts That Apply to Every Module Below

- **Tenant-scoping pattern is already established** (Phase 1): `clients` and `projects` both have a nullable `org_id` column and both `create_*` handlers already accept `tenant: Annotated[TenantContext, Depends(get_tenant_context)]` and stamp `org_id=tenant.org_id` (`app/api/v1/clients.py:43,60`, `app/api/v1/projects.py:58,76`). This is currently a no-op write when `DUAL_WRITE_ORGANIZATIONS_ENABLED=False` and a real stamp now that it's `True` in production. **Nothing in Phase 2 needs to touch this wiring** — it's done. `list`/`get`/`update`/`delete` still scope by `user_id`, not `org_id` — that shift is explicitly Milestone 4 (org-scoped access layer), out of scope here per your Phase 1 answer.
- **Soft-delete convention exists on `clients` and `projects`** (`deleted_at`, filtered on every read, set not hard-deleted on `DELETE` — verified in `BACKEND_IMPLEMENTATION_PLAN.md` §0). **`milestones` does not follow this convention** — `Milestone` has no `deleted_at` column and `delete_milestone` hard-deletes (`app/api/v1/milestones.py:227`). Flagging as a real inconsistency found during this validation pass; see Module 3.
- **`milestones` has no `org_id` column at all** (checked `app/models/milestone.py` — absent) and doesn't need one: it's scoped transitively through `project_id → client_id → user_id` via `get_user_project_ids()` (`app/api/v1/milestones.py:20`). No migration needed for Milestones in Phase 2.
- **Test coverage baseline:** only `tests/test_clients.py` exists today (13 tests, per `BACKEND_IMPLEMENTATION_PLAN.md`'s audit log). **`tests/test_projects.py`, `tests/test_milestones.py` do not exist.** This is a real, current gap — Projects and Milestones are fully implemented, real features with zero dedicated test coverage.
- **Alembic head:** `01abb4f68454`, unchanged since Phase 1. Any new migration in this phase chains off this revision.

---

## 1. Clients

### 1.1 Existing (verified live, `app/api/v1/clients.py`)
`GET /api/v1/clients`, `POST /api/v1/clients`, `GET /api/v1/clients/{id}`, `PUT /api/v1/clients/{id}`, `DELETE /api/v1/clients/{id}` (soft delete). Phone uniqueness scoped per-user (§0 of the main plan confirmed this is correct, not a cross-tenant leak). Notification on create (`on_client_created`, background task, WhatsApp).

### 1.2 Frontend consumers
`lib/api.ts` `clientsAPI` (`app/clients/page.tsx`, `app/channels/page.tsx`, client-detail routes) — all real fields wired correctly, no schema drift between `ClientCreate`/`ClientUpdate`/`ClientResponse` (`app/schemas/client.py`) and `clientsAPI`'s TS param shapes.

### 1.3 Gaps
- **`health` score** (`app/clients/page.tsx:47`, `mockHealth(id)`) — deterministic hash-based mock. No real scoring exists or is computed anywhere server-side.
- **`mrr`** (`app/clients/page.tsx:51`, `mockMRR(id)`) — mock. No per-client billing/revenue concept exists; `subscriptions` is per-user, not per-client.

### 1.4 Proposed changes
**Nothing is being built for Clients in this phase** unless you resolve the two open product decisions below — both were already flagged as Open Decision #2 in `BACKEND_IMPLEMENTATION_PLAN.md` §7 and remain unanswered:
1. Health score: build a real computed score (needs an algorithm — inputs and weights, e.g. response latency, message volume trend, milestone on-time rate) or keep it explicitly illustrative?
2. MRR: this requires deciding clients are billed individually (a product/billing model change, not just an engineering task) — out of scope until that's decided.

**If you want Clients to ship real data in this phase**, the minimal version of each:
- Health: add a nullable `health_score` computed column or a lightweight nightly recompute job (Celery Beat, same pattern as `github_sync.py`) — no new table needed, one migration (`ALTER TABLE clients ADD COLUMN health_score INTEGER`).
- MRR: **not recommended for this phase** — it's a billing-model decision, not a schema gap, and doing it wrong (e.g., inventing a fake per-client billing relationship) would need to be unwound later.

**Resolved 2026-07-25 (Milestone 1 approval):**
1. **Health score:** not implemented. No stored `health_score` field, no fabricated algorithm. Documented as a future **Health Scoring Service** — a separate service that will aggregate signals from Conversations, Projects, Milestones, GitHub, and Automations once those signal sources are themselves real (several aren't yet — see Phases 3/4/6 in `BACKEND_IMPLEMENTATION_PLAN.md` §6). Frontend presentation (`mockHealth` in `app/clients/page.tsx`) is unchanged. This resolution is scoped to **Clients only** — Projects §2.3 and Channels §4.2 each still list their own `health` mock as a separately-open item; the same future service would likely back all three once it exists, but that extension isn't decided here.
2. **MRR:** not implemented. No approved billing model supports per-client recurring revenue. Deferred until a future billing domain is designed. Frontend presentation (`mockMRR` in `app/clients/page.tsx`) is unchanged.

No backend or frontend changes for either. Proceeding to Projects with Clients otherwise as-is.

### 1.5 DTO / schema changes
None. Confirmed no change following the resolution above.

### 1.6 Backward compatibility
N/A — no changes proposed by default.

### 1.7 Test plan
No gap — `test_clients.py` already covers auth guards, CRUD, duplicate-phone detection, and 4 cross-tenant isolation tests (per prior audit).

---

## 2. Projects

### 2.1 Existing (verified live, `app/api/v1/projects.py`)
`GET /api/v1/projects` (optional `client_id` filter, 403 if the client isn't yours), `POST`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` (soft delete). Ownership checked via `get_user_client_ids()` → `client.user_id == current_user.id`, correct. Notifications on create (`on_project_created`) and on status→`completed` transition (`on_project_completed`).

### 2.2 Frontend consumers
`projectsAPI` (`app/projects/page.tsx`, client-detail project lists, milestones page's parent-project fetch). Schema match confirmed clean between `ProjectCreate`/`ProjectUpdate`/`ProjectResponse` and the TS client.

### 2.3 Gaps
- **`github_cache` is write-only.** `app/models/github_cache.py` has `commits_count`, `commits_last_7_days`, `open_issues`, `closed_issues`, `pull_requests`, `last_commit_message`, `last_commit_date`, `progress_percent`, `synced_at` — populated hourly by Celery (`tasks/github_sync.py`) but **no endpoint returns it.** One row per project (`project_id` is `unique=True`), so this is a simple join, not a time series.
- **`health`** (`app/projects/page.tsx:38`, `mockHealth`) — same open product decision as Clients.
- **`agent`** (`app/projects/page.tsx`, `mockAgent`) — AI-agent-assignment placeholder; genuinely blocked on Phase 5 (AI Agents) deciding whether agents are a real per-project-assignable concept at all (Open Decision #3 in the main plan, still open).

### 2.4 Proposed changes
**GitHub stats exposure (recommended, real, no product decision needed):**
- New response schema `ProjectWithGitHubStats(ProjectResponse)` in `app/schemas/project.py`, adding `github_stats: Optional[GitHubStatsSchema]` with the 8 real fields above (nested, not flattened, so `github_stats: null` cleanly represents "not synced yet" for projects with `github_sync_enabled=False` or no sync run yet).
- `GET /api/v1/projects/{id}` and `GET /api/v1/projects` switch their `response_model` to the new schema; handler adds one `db.query(GitHubCache).filter(GitHubCache.project_id == project.id).first()` (or a joined-load / `selectinload` on the list endpoint to avoid N+1 — list endpoint currently has no eager loading at all, this would need `.options(selectinload(Project.github_cache))` added to the base query in `list_projects`).
- **No migration required** — `github_cache` table and its Celery population already exist; this is purely a read-path + schema change.

**Health/agent:** same as Clients — deferred pending your product decisions, not built this phase by default.

### 2.5 DTO / schema changes
- New: `GitHubStatsSchema` (Pydantic, `from_attributes=True`) mirroring `GitHubCache` columns minus `id`/`project_id`.
- Changed: `ProjectResponse` → `ProjectWithGitHubStats` becomes the default response model for `GET` endpoints (list + detail). `POST`/`PUT` keep returning plain `ProjectResponse` (a just-created/updated project has no cache row yet) — or also switch to the nested shape with `github_stats: null`, for frontend type consistency. **Recommendation: switch everywhere, always nested, so the frontend has one type instead of two.**

### 2.6 Backward compatibility
Additive only (`github_stats` is a new nested optional field) — no existing consumer breaks. Frontend `types/index.ts`'s `Project` type needs the new optional field added; every existing usage of `Project` still compiles since it's additive.

### 2.7 Frontend impact
- `types/index.ts`: extend `Project` with `github_stats?: { commits_count, commits_last_7_days, open_issues, closed_issues, pull_requests, last_commit_message, last_commit_date, progress_percent, synced_at } | null`.
- `app/projects/page.tsx`: can now source `open_prs`, `build_status`-adjacent data, `commits_last_7_days`, `progress_percent` from real data instead of leaving those slots unfilled/mocked — **this itself is a frontend change**, out of scope for "don't modify the frontend" unless you want it wired in the same phase; the API contract alone can ship first and the frontend consume it in a follow-up, per your "don't redesign completed frontend pages" constraint — recommend treating the actual page wiring as a small, separate, explicitly-approved follow-up rather than bundling it into this backend-only phase.

### 2.8 Test plan
**New file: `tests/test_projects.py`** (doesn't exist today). Minimum coverage mirroring `test_clients.py`'s shape: auth guards, full CRUD, cross-tenant isolation (project belonging to another user's client must 403/404), `client_id` filter access-denied path (`app/api/v1/projects.py:41-45`), and — once built — `github_stats` nesting (present when cache row exists, `null` when it doesn't).

---

## 3. Milestones

### 3.1 Existing (verified live, `app/api/v1/milestones.py`)
`GET /api/v1/milestones` (optional `project_id` filter), `POST`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`. Ownership via `get_user_project_ids()` (joins `Project`→`Client`→`user_id`). Auto-sets `completed_at` on status→`completed` (`app/api/v1/milestones.py:182`). Notification on completion (`on_milestone_completed`, includes recomputed project progress via `_get_project_progress`).

### 3.2 Frontend consumers
`milestonesAPI` (`app/clients/[id]/projects/[projectId]/milestones/page.tsx`). Schema match clean.

### 3.3 Gaps (found during this validation pass, not in the original audit)
- **No soft delete.** `delete_milestone` calls `db.delete(milestone)` (`app/api/v1/milestones.py:227`) — a real, permanent hard delete, inconsistent with `clients`/`projects`. Not flagged in the original audit (which only checked `clients`/`projects` for this).
- No other functional gaps — this module is small and fully real.

### 3.4 Proposed changes
**Recommended: bring `milestones` to the same soft-delete convention as `clients`/`projects`, for consistency and to stop permanently destroying milestone history (which feeds `_get_project_progress`'s completion-percentage math — a hard-deleted "completed" milestone silently changes a project's historical progress number).**
- Migration: `ALTER TABLE milestones ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE NULL` (additive, nullable, safe — same shape as the existing `clients.deleted_at`/`projects.deleted_at` columns, matching Alembic revision style used in Milestone 1/2).
- `list_milestones`/`get_milestone`/`update_milestone` add `.filter(Milestone.deleted_at.is_(None))`.
- `delete_milestone` changes from `db.delete(milestone)` to `milestone.deleted_at = datetime.now(timezone.utc); db.commit()`.
- `_get_project_progress` (`app/api/v1/milestones.py:31`) must also filter `deleted_at.is_(None)` — otherwise soft-deleted milestones would incorrectly still count toward project progress once the column exists.

This is a genuine, in-scope bug-adjacent fix (data-loss-on-delete), not scope creep — flagging it as a recommendation rather than assuming approval, since it's not something you explicitly asked for.

### 3.5 DTO / schema changes
None to request/response shape. `MilestoneResponse` doesn't need a `deleted_at` field exposed (matches `ClientResponse`/`ProjectResponse`, which also don't expose it).

### 3.6 Backward compatibility
Additive migration, no breaking change. `DELETE` endpoint's response contract (204, no body) is unchanged — only its internal effect changes from hard to soft delete.

### 3.7 Frontend impact
None. `DELETE /milestones/{id}` still returns 204; the frontend doesn't need to change.

### 3.8 Test plan
**New file: `tests/test_milestones.py`** (doesn't exist today). Auth guards, full CRUD, cross-tenant isolation, `project_id` filter access-denied path, `completed_at` auto-set on status transition, project-progress recompute correctness, and — if the soft-delete change is approved — a test that a deleted milestone (a) doesn't appear in `list`, (b) doesn't count toward `_get_project_progress`.

---

## 4. Channels

### 4.1 Existing
**No backend route exists.** No `channels.py` router, no `channelsAPI` in `lib/api.ts`. Confirmed via `ls app/api/v1/` (no match) and grep of `lib/api.ts` (no match).

### 4.2 Current frontend behavior (`app/channels/page.tsx`, read in full)
- **Real:** which channels exist per client — derived client-side from `clientsAPI.list()`'s existing `phone`/`telegram_chat_id`/`email` fields (`app/channels/page.tsx:51-55`). This part needs no backend change at all.
- **Mock:** `health` (`mockHealth`), `volume` — "messages today" (`mockVolume`), `minutesAgo` — "last activity" (`mockMinutesAgo`). All deterministic hash-based placeholders (`app/channels/page.tsx:19-29`), explicitly commented in the code as mock.

### 4.3 A material finding from this validation pass
`ChatHistory.channel` (`app/models/chat_history.py:21`) is constrained to `"whatsapp" | "telegram"` only — **there is no `"email"` value ever written to `chat_history`**, because email is a one-way notification/reset channel (`email_service.py`, Resend), not a two-way conversational one. This means a real "volume today"/"last activity" aggregate from `chat_history` can back WhatsApp and Telegram rows correctly, but **cannot back Email rows** — there's no data source for "email activity" at all (`notification_service.py` is explicitly fire-and-forget with no persistence, per `BACKEND_IMPLEMENTATION_PLAN.md` §2.2). This needs a decision before building: drop Email from the real-data Channels view, or accept it stays permanently mock/zero until a notification-history table exists (out of scope here).

### 4.4 Proposed changes (WhatsApp + Telegram only, per §4.3)
- **New endpoint, no new table:** `GET /api/v1/channels` in a new `app/api/v1/channels.py` router, registered at `/api/v1/channels`.
- Query: `SELECT client_id, channel, COUNT(*) FILTER (WHERE created_at >= today) AS volume_today, MAX(created_at) AS last_activity FROM chat_history WHERE client_id IN (user's client ids) GROUP BY client_id, channel` — one query, scoped the same way `get_user_client_ids()` already scopes Clients (reuse that helper from `app/api/v1/clients.py`, or promote it to a shared `app/utils/`).
- Response: `List[ChannelActivityResponse]` — `{client_id, channel, volume_today, last_activity}`. The frontend already knows which channels exist per client (from `clientsAPI`); this endpoint only needs to supply the two real numbers, joined client-side exactly like today's mock join, just swapping `mockVolume`/`mockMinutesAgo` for real lookups keyed by `${client_id}-${channel}`.
- **Health score:** same open product decision as Clients/Projects — not built by default.

### 4.5 DTO / schema changes
- New: `app/schemas/channel.py` — `ChannelActivityResponse(client_id: UUID, channel: str, volume_today: int, last_activity: Optional[datetime])`. No `ChannelCreate`/`ChannelUpdate` — this is a read-only aggregate, not an owned resource.

### 4.6 Schema/migration changes
**None.** Zero new tables, zero new columns — pure aggregate query over existing `chat_history`.

### 4.7 Backward compatibility
N/A — net-new endpoint, nothing existing changes shape.

### 4.8 Frontend impact
`lib/api.ts` needs a new `channelsAPI.list()` (additive). `app/channels/page.tsx` would need `mockVolume`/`mockMinutesAgo` swapped for the new endpoint's data, keeping `mockHealth` until that product decision lands — **this is a frontend change**, same caveat as Projects §2.7: recommend shipping the endpoint in this phase and treating the page wiring as a small, separately-approved follow-up, consistent with "don't modify the frontend unless an API contract absolutely requires it" — the contract doesn't *require* an immediate frontend change, since the mock currently degrades gracefully with no backend at all.

### 4.9 Test plan
**New file: `tests/test_channels.py`**. Auth guard, correct per-user scoping (reuse the same cross-tenant-isolation pattern as `test_clients.py`), `volume_today` correctly counts only today's rows, `last_activity` correctly picks the max timestamp, and a client with zero `chat_history` rows returns no rows (not an error) for that client.

---

## 5. Consolidated API Contract Summary

| Endpoint | Method | Status | Change |
|---|---|---|---|
| `/api/v1/clients` | GET/POST | Live | None |
| `/api/v1/clients/{id}` | GET/PUT/DELETE | Live | None |
| `/api/v1/projects` | GET/POST | Live | Response model → `ProjectWithGitHubStats` (additive) |
| `/api/v1/projects/{id}` | GET/PUT/DELETE | Live | Response model → `ProjectWithGitHubStats` (additive) |
| `/api/v1/milestones` | GET/POST | Live | Add `deleted_at.is_(None)` filter |
| `/api/v1/milestones/{id}` | GET/PUT/DELETE | Live | `DELETE` becomes soft delete |
| `/api/v1/channels` | GET | **New** | New router, new schema, no new table |

## 6. Consolidated Migration List

| # | Change | Table | Type |
|---|---|---|---|
| 1 | `deleted_at TIMESTAMPTZ NULL` | `milestones` | Additive column, nullable — safe, no backfill required (existing rows read as "not deleted") |

That's the only schema change proposed in this phase. GitHub-stats exposure and Channels are both read-path-only against existing tables.

## 7. Consolidated Services / Controllers Touched

| File | Change |
|---|---|
| `app/api/v1/projects.py` | Add `GitHubCache` join to `list_projects`/`get_project`, switch response model |
| `app/schemas/project.py` | Add `GitHubStatsSchema`, `ProjectWithGitHubStats` |
| `app/api/v1/milestones.py` | Add soft-delete filtering (3 read paths), change `delete_milestone`, fix `_get_project_progress` filter |
| `app/api/v1/channels.py` | **New file** — `GET /` handler |
| `app/schemas/channel.py` | **New file** — `ChannelActivityResponse` |
| `app/main.py` | Register `channels_router` at `/api/v1/channels` |
| `alembic/versions/` | One new revision for `milestones.deleted_at` |

No new background jobs, no changes to `messaging_core.py`/`ai_service.py`/any provider integration — this phase is purely CRUD-and-read-path work on already-real tables.

## 8. Authorization

No authorization model changes. Every new/changed endpoint continues to use the existing `get_current_user` + ownership-chain pattern (`user_id` → `client.user_id` → `project.client_id` → `milestone.project_id`), exactly as today. **No `require(permission)`/RBAC enforcement is introduced** — that's explicitly Milestone 4, deferred per your Phase 1 answer, and nothing here depends on it.

## 9. Validation

Request/response validation is unchanged (Pydantic schemas, same pattern as today) except the two additive schemas above (`GitHubStatsSchema`, `ChannelActivityResponse`), which follow the existing `ConfigDict(from_attributes=True)` convention.

## 10. Overall Test Plan

1. `tests/test_projects.py` — new, full CRUD + isolation + GitHub-stats nesting.
2. `tests/test_milestones.py` — new, full CRUD + isolation + soft-delete + progress-recompute correctness.
3. `tests/test_channels.py` — new, aggregate correctness + isolation.
4. `tests/test_clients.py` — no changes needed, already covers this module.
5. Full suite (`python -m pytest -q`) must stay green throughout, per your standing instruction — run after each module, not just at the end.

## 11. Rollback Strategy

- **Milestones soft-delete migration:** additive/nullable column — `alembic downgrade -1` cleanly drops it if needed; no data-loss risk in either direction since old rows just read `deleted_at = NULL`.
- **Projects GitHub-stats response model change:** pure code change, no migration — revert via `git revert` of the relevant commit(s); zero DB risk.
- **Channels new router:** pure addition — remove the router registration in `app/main.py` to fully disable with no other side effects; zero DB risk (no table, no migration).
- None of this phase's changes touch `DUAL_WRITE_ORGANIZATIONS_ENABLED`, `organizations`, or `memberships` — Phase 1's rollback plan (`PHASE1_ROLLOUT_PLAN.md` §5) is entirely unaffected by anything in this phase.

## 12. Open Decisions Carried Into This Phase (updated after Milestone 1 approval, 2026-07-25)

1. ~~**Health scoring** (Clients, Projects, Channels)~~ — **Clients resolved:** no stored field, no fabricated algorithm; documented as a future **Health Scoring Service** aggregating Conversations/Projects/Milestones/GitHub/Automations signals, not built now. **Projects (§2.3) and Channels (§4.2) health scores remain open** — not extended to them by this decision, would need their own explicit resolution.
2. ~~**MRR** (Clients)~~ — **Resolved:** not implemented, no approved billing model, deferred until a future billing domain is designed.
3. **AI-agent assignment** (Projects) — blocked on Phase 5 scope decision, not scoped in this phase regardless.
4. **Email as a Channels row** (new, from §4.3) — drop it from the real-data view, or accept it stays mock/zero until a notification-history table exists (that table is out of scope for Phase 2).

None of these block shipping the concrete, real changes proposed in §5–§7 above — they only block the mock fields that were already known to be mock before this plan was written.
