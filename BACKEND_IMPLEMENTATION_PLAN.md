# Backend Implementation Plan

**Status:** Audit complete, then corrected once (see §0). No code changed as part of this document. Everything below reflects the codebase exactly as it stands.

## 0. Correction Log

This document was validated against the live codebase on the request that opened the Backend Phase. Two findings from the original audit were wrong and are corrected in place below (not left as errata) per the standing instruction to fix the source document rather than carry forward incorrect findings:

1. **`deleted_at` soft-delete claim was wrong.** The original §5 said `clients`/`projects` soft-delete columns exist but "no query filters on them." False — verified by reading `clients.py`/`projects.py` directly: every list/get/update query filters `.deleted_at.is_(None)`, and both `DELETE` endpoints correctly set `deleted_at` rather than hard-deleting. No gap here. Removed from §5.
2. **Organizations/Memberships/Roles/Invitations were characterized as "dormant, schema-only, needs building."** This significantly understated reality. The original audit never looked in `docs/`, which contains two authoritative documents that were missed entirely:
   - **`docs/TARGET_ARCHITECTURE.md`** — a 23-section target architecture for the full multi-tenant evolution (org model, RBAC, modular monolith, event bus, per-domain worker queues, billing-per-org, etc.), already written and treated as the standing design reference for this exact work.
   - **`docs/PHASE1_ROLLOUT_PLAN.md`** — an **approved, step-by-step production rollout plan** ("Status: Approved for execution, step by step") for deploying exactly the Organization/Role/Membership/Invitation work, in three milestones: Milestone 1 (schema), Milestone 2 (expand `projects.org_id`), Milestone 3 (dual-write activation via feature flag). It explicitly states **Milestone 4 (the API/enforcement layer) is not yet scoped** and should not be built until Milestones 1–3 have soaked in production for 1–2 weeks under defined success criteria (§8 of that document).

   Validated directly against the running dev database and test suite:
   - `alembic current` → `01abb4f68454` (head) — **both Milestone 1 and 2 migrations are already applied** to this database.
   - `roles` table has exactly the 5 expected seeded system roles (`owner`, `admin`, `member`, `billing`, `viewer`), all `org_id IS NULL`, `is_system=True` — matches the rollout plan's migration description exactly.
   - `organizations`, `memberships`, `invitations` are all **0 rows** — the backfill (Milestone 3, Phase D of the rollout plan) has **not** been run yet.
   - `DUAL_WRITE_ORGANIZATIONS_ENABLED` and `DUAL_READ_SHADOW_VERIFY_ENABLED` are both unset (default `False`), consistent with backfill not having run.
   - Full test suite: **122 passed, 0 failed** (includes dedicated `test_organizations.py`, `test_organization_backfill.py`, `test_tenant_context.py`, `test_tenant_context_integration.py` — this area has real, passing test coverage already, contrary to the original audit's implication that this was unstarted work).

   **Net effect:** this is not a "build multi-tenancy from scratch" phase. It is: (a) execute the remaining, already-designed rollout steps (backfill → verify → flag activation) that this repo's own architect already approved, then (b) scope and build Milestone 4 (org/team/role API endpoints + RBAC enforcement) — which is genuinely new work, not yet designed in detail anywhere. §5, §6, and §7 below are corrected accordingly. See the question at the end of this document before any execution step is taken.

**Purpose:** Map every frontend page/component/hook to the backend endpoint, database table, and service it actually talks to (or doesn't), so future implementation work has an accurate baseline instead of assumptions.

**How to read the status badges:**
- ✅ **Real** — Frontend calls a real endpoint, backed by a real table, returning real computed/stored data.
- 🟡 **Partial** — Some fields on the page are real; others are mock/hardcoded/placeholder, explicitly labeled as such in the frontend source (`// mock` comments were added deliberately during the v3 UI build so this boundary is traceable in code, not just in this doc). Also used in §2.1 for backend tables that are migrated/seeded but not yet read by any route.
- ⚪ **Mock** — Page renders, but none of its data reaches the backend. Either no endpoint exists, or the endpoint exists but nothing calls it from this page.
- 🔒 **Dormant** — Backend schema/table exists but is not reachable from any live API path (feature-flagged off or simply never wired to a router).

---

## 1. Executive Summary

The backend is considerably more built than the frontend currently uses. Core CRUD (auth, clients, projects, milestones, chat/messaging, billing, API keys, BYOK AI keys) is fully real, tested against a live Supabase Postgres instance, and already exposed via 12 registered FastAPI routers (~45 endpoints). A real-time WebSocket channel, a Celery+Redis background job runner, and a tool-calling AI agent (GitHub search/file/issue tools + a local knowledge-base tool) all exist and work today.

The gap is concentrated in five areas, all discovered during the recent v3 UI rebuild and marked inline in the frontend source with comments like `// No automation/workflow engine exists on the backend yet`:

1. **Multi-tenancy (Organizations/Team Members/Roles & Permissions)** — the DB schema exists in full (`organizations`, `memberships`, `roles`, `invitations` tables, with a working RBAC permission model on `roles.permissions`) but is entirely gated behind `DUAL_WRITE_ORGANIZATIONS_ENABLED=False` and has **zero API routes**. This is schema-complete, API-absent.
2. **Automations** — no table, no service, no route. A real Celery Beat scheduler already runs one hourly job (GitHub sync), so the execution infrastructure exists; there is no workflow/trigger/condition/action model on top of it.
3. **AI Agents (multi-agent fleet)** — the real backend has exactly one configurable chat context (general or project-scoped) with tool-calling. There is no per-agent config, prompt versioning, deployment state, or reasoning-trace log — the frontend's `/agents` fleet dashboard is 100% illustrative.
4. **Health/confidence/sentiment scoring** — used all over Clients, Projects, Channels, Analytics, and Conversation Center in the UI; there is no scoring model, no stored field, no computation anywhere in the backend.
5. **Notification preferences, GitHub cache exposure, billing enrichment (invoices, seats, payment method)** — smaller gaps, each with a real adjacent table/service that just isn't surfaced via an endpoint yet.

Everything below is the detailed map. Section 6 is the dependency-ordered roadmap.

---

## 2. Backend Inventory

### 2.1 Database Tables

| Table | Model | Status | Notes |
|---|---|---|---|
| `users` | `User` | ✅ Live | Root tenant boundary today. No `org_id` column — every other table's `org_id` FK is nullable and unused in queries. |
| `clients` | `Client` | ✅ Live | Scoped by `user_id`. `phone` unique+required, `email`/`telegram_chat_id` optional+unique. Soft delete via `deleted_at`, correctly filtered (`.deleted_at.is_(None)`) on every read query and set (not hard-deleted) on `DELETE` — verified, no gap. Has nullable `org_id` (Milestone 1, unused while dual-write is off). |
| `projects` | `Project` | ✅ Live | Scoped via `client.user_id`. `github_repo`, `github_sync_enabled` real. Same correct soft-delete behavior as `clients`. Has nullable `org_id` (Milestone 2, unused while dual-write is off). |
| `milestones` | `Milestone` | ✅ Live | Full CRUD, `progress` (0-100 int), `status` enum (pending/in_progress/completed/blocked). |
| `chat_history` | `ChatHistory` | ✅ Live | One row per client message + AI response pair. `channel` field (`whatsapp`\|`telegram`). No sentiment/confidence columns. |
| `github_cache` | `GitHubCache` | 🟡 Write-only | Populated hourly by Celery (`commits_count`, `open_issues`, `pull_requests`, `progress_percent`, etc.) but **no route or schema ever reads it back** — see §5.3. |
| `plans` | `Plan` | ✅ Live | Free/Pro/Enterprise tiers with `max_clients`/`max_projects`/`max_api_keys`/`max_ai_messages_per_month`/`features` JSON. No `max_seats` field (see Billing/Team gaps). |
| `subscriptions` | `Subscription` | ✅ Live | Stripe + Razorpay gateway IDs, period dates, `cancel_at_period_end`. |
| `api_keys` | `APIKey` | ✅ Live | Hash-only storage, `scopes` JSON array, rotation supported. |
| `usage_logs` | `UsageLog` | ✅ Live | Per-day, per-endpoint request counts. |
| `user_ai_keys` | `UserAIKey` | ✅ Live | BYOK, Fernet-encrypted, `is_valid`/`last_validated_at` tracked. |
| `roles` | `Role` | 🟡 Seeded, unread | Migrated and seeded with exactly 5 system roles (`owner`/`admin`/`member`/`billing`/`viewer`, `org_id IS NULL`, `is_system=True`) — verified live in production. `permissions` JSON array (e.g. `["org:admin", "client:write"]`) matches the Roles & Permissions page's matrix shape. **No route exposes this table yet** (Milestone 4, not yet scoped — see §0, §2.6, §8). |
| `organizations` | `Organization` | 🟢 Backfilled, dual-write live | **Updated 2026-07-25 (§8):** 14 rows — one personal org per existing user, backfilled via `PHASE1_ROLLOUT_PLAN.md` Phase D. New user signups now dual-write here too (`DUAL_WRITE_ORGANIZATIONS_ENABLED=True` in production). **Still no route** — data exists and is being written, but nothing reads it back yet (Milestone 4). |
| `memberships` | `Membership` | 🟢 Backfilled, dual-write live | 14 rows (one owner membership per backfilled org), same status as `organizations`. **No route yet.** |
| `invitations` | `Invitation` | 🟡 Migrated, empty | Table exists live, 0 rows — nothing writes to this table yet even with dual-write on (invitations are a Milestone 4 API-layer concept). Pending email invites, token-based, `uq_invitations_org_email` re-invite handling. **No route yet.** |

### 2.2 Services (`backend/app/services/`)

| Service | Purpose | Consumed by |
|---|---|---|
| `messaging_core.py` | Single shared pipeline: client lookup → project/GitHub context → AI response → persist `ChatHistory` → WebSocket broadcast. | `whatsapp.py`, `telegram.py` webhooks |
| `ai_agent.py` (`VoxlyAgent`) | Tool-calling agent used by the admin `/chat` page. Tools: `GitHubSearchIssuesTool`, `GitHubGetFileTool`, `GitHubCreateIssueTool`, `LocalDocsTool` (`app/tools/`). | `ai.py` (`POST /api/v1/ai/chat`) |
| `ai_service.py` | Orchestrator that picks a provider (`ai_providers/{claude,openai,gemini}_provider.py`) and generates a client-facing response. | `messaging_core.py` |
| `github_service.py` | Live `fetch_github_stats(repo)` via PyGithub. | `tasks/github_sync.py`, `ai.py` context builder |
| `cache_service.py` | Redis-backed cache with in-process fallback + circuit breaker (per CLAUDE.md 2026-03-01 hardening). `get_github_stats_cached`. | `ai.py`, `messaging_core.py` |
| `whatsapp_service.py` | Twilio `send_whatsapp_message`. | `notification_service.py`, `messaging_core.py` |
| `telegram_service.py` | Telegram Bot API sender (raw httpx, no SDK dep). | `messaging_core.py` |
| `notification_service.py` | Event-driven WhatsApp templates (client created, project created, milestone completed, project completed, manual follow-up). **No persistence** — fire-and-forget, no notification history table. | `notifications.py`, model create/update paths |
| `email_service.py` | Resend-based transactional email. Currently only `send_password_reset_email`. | `auth.py` password reset |
| `transcription_service.py` | Voice-note → text (Agent Vision Phase 0). Fully gated by `VOICE_TRANSCRIPTION_ENABLED` (default off); never raises, degrades silently. | `messaging_core.py` (when flag on) |
| `localization.py` | Hindi/English detection + canned-string translation. Gated by `LANGUAGE_DETECTION_ENABLED` (default off). | `messaging_core.py` |

### 2.3 API Endpoints (all registered in `main.py`)

| Router | Prefix | Endpoints |
|---|---|---|
| `auth` | `/api/v1/auth` | `POST /google`, `GET /github`, `POST /github/callback`, `POST /register` (5/min), `POST /login` (10/min), `POST /refresh`, `GET /me`, `PUT /profile`, `POST /change-password`, `POST /password-reset/request` (3/min), `POST /password-reset/confirm`, `GET /me/export` (5/min), `DELETE /me` (2/min) |
| `clients` | `/api/v1/clients` | `GET ""`, `POST ""`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` |
| `projects` | `/api/v1/projects` | `GET ""`, `POST ""`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` |
| `milestones` | `/api/v1/milestones` | `GET ""`, `POST ""`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` |
| `chat` | `/api/v1/chat` | `WS /ws` (real-time, JWT-in-query auth), `GET /history/{client_id}`, `GET /messages` (paginated, all-clients) |
| `whatsapp` | `/api/v1/whatsapp` | `POST /webhook` (Twilio signature-verified), `GET /webhook` |
| `telegram` | `/api/v1/telegram` | `POST /webhook`, `GET /webhook` (health) |
| `api-keys` | `/api/v1/api-keys` | `POST /`, `GET /`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`, `POST /{id}/rotate` |
| `billing` | `/api/v1/billing` | `GET /plans`, `GET /subscription`, `POST /checkout`, `POST /webhook/stripe`, `POST /webhook/razorpay`, `GET /usage`, `POST /portal` |
| `notifications` | `/api/v1/notifications` | `POST /send` (10/min) — **only** endpoint; docstring promises history + toggle endpoints that don't exist |
| `dashboard` | `/api/v1/dashboard` | `GET /stats` |
| `ai-keys` | `/api/v1/ai-keys` | `GET /providers`, `GET /`, `POST /`, `DELETE /{id}`, `POST /{id}/validate` |
| `github` | `/api/v1/github` | `POST /webhook` (HMAC-verified, host-allowlisted log fetch) — **write-only**, nothing reads `github_cache` back out |
| `ai` | `/api/v1/ai` | `POST /chat` (20/min) — the real tool-calling agent behind `/chat` |
| `super_admin` | `/voxly-admin` | `GET /tenants`, `GET /stats`, `PATCH /users/{id}/plan`, `PATCH /users/{id}/disable`, `POST /impersonate/{id}`, `GET /tenants/{id}`, `GET /activity` — `include_in_schema=False`, own admin-secret auth, powers `voxly-admin/page.tsx` only |

No route files exist for: organizations, team-members, roles, automations, channels, analytics (dashboard.py covers the Dashboard page only, not the Analytics page's revenue/AI-cost/automation-metrics content).

### 2.4 Feature Flags (`app/config.py`) — code default `False` for both

| Flag | Gates | Production value (since 2026-07-25, §8) |
|---|---|---|
| `DUAL_WRITE_ORGANIZATIONS_ENABLED` | `app/utils/tenant_context.py` — the only code that touches `organizations`/`memberships`/`roles` today. A total no-op when off (exception-swallowed, returns unresolved). | **`True`** — set as a Cloud Run env var override, not a code-default change. New user registrations and the 6 wired write endpoints now self-heal org/membership rows live. |
| `DUAL_READ_SHADOW_VERIFY_ENABLED` | Shadow-verification path for the above, also inert while the write flag is off. | `False` — deferred per `PHASE1_ROLLOUT_PLAN.md`, not part of this rollout. |
| `VOICE_TRANSCRIPTION_ENABLED` | `transcription_service.py` | `False` — unrelated to this rollout, unchanged. |
| `LANGUAGE_DETECTION_ENABLED` | `localization.py` | `False` — unrelated to this rollout, unchanged. |

### 2.5 Background Jobs

Celery app (`app/tasks/celery_app.py`), Redis broker, `Asia/Kolkata` timezone. One registered periodic task:

- `sync-github-repos-hourly` → `sync_all_github_repos` → fans out `sync_single_repo.delay()` per active project with a `github_repo` set, writing into `github_cache`.

This is real, working infrastructure that an Automations engine (§6, Phase 8) should build on rather than replace.

### 2.6 Existing Architecture & Rollout Documentation (missed by the original audit)

`docs/` contains extensive prior architecture and planning work directly relevant to every phase below. The two load-bearing ones for Phase 1:

- **`docs/TARGET_ARCHITECTURE.md`** — full target-state design: tenant boundary moves from `User` to `Organization`; shared-schema + `org_id` row-level isolation, enforced via a single tenant-scoped access layer plus Postgres RLS as defense-in-depth; RBAC via `roles.permissions` and a `require(permission)` dependency; a 9-phase migration roadmap (§23 of that doc) covering org model → tenant access layer/RLS → RBAC/teams → modular monolith → events/workers → async integrations → per-org billing → search/storage/gateway → enterprise tier. Read this before designing any Phase 1 API surface — it already specifies the permission catalog, default roles, and enforcement pattern.
- **`docs/PHASE1_ROLLOUT_PLAN.md`** — operational, step-by-step, approved rollout of that architecture's first slice (its own "Milestones 1–3", not the same numbering as this document's phases). Defines the exact migration IDs, the backfill tool's CLI (`python -m app.scripts.backfill_organizations`, with `--dry-run`/`--verify`/`--rollback`), a 4-layer rollback plan, a monitoring checklist, and explicit go/no-go success criteria before what it calls "Milestone 4" (the API/enforcement layer — new routers, `require(permission)`) can be scoped.

**Verified current state of this environment, updated 2026-07-25 post-Phase-1 (§8)** — this is confirmed production:

| Check | Result |
|---|---|
| `alembic current` | `01abb4f68454` (head) — Milestone 1 + 2 migrations applied, unchanged this phase |
| `roles` table | 5 rows, exactly the expected system roles, correctly shaped |
| `organizations` / `memberships` | 14 rows each — backfilled 2026-07-25, `--verify` passed all 8 checks, 0 duplicate-owner orgs |
| `invitations` | 0 rows — unaffected by backfill, this table is Milestone 4 scope |
| `DUAL_WRITE_ORGANIZATIONS_ENABLED` | **`True`** in production (Cloud Run env override) since 2026-07-25 — soak period per §8 of the rollout plan starts now |
| `DUAL_READ_SHADOW_VERIFY_ENABLED` | `False` — deferred, not part of this rollout |
| Test suite | 122 passed, 0 failed, includes dedicated org/RBAC/tenant-context test files |

This is the actual starting line for Phase 2, not a blank slate. Milestone 4 (the org/team/role API layer) remains unbuilt and gated behind the soak-period success criteria in `PHASE1_ROLLOUT_PLAN.md` §8 — nothing in Phase 2 (Clients/Projects/Milestones/Channels) depends on Milestone 4 being done first.

---

## 3. Frontend Inventory

### 3.1 Pages (19 app routes + 5 auth/marketing routes)

`dashboard`, `clients`, `clients/new`, `clients/[id]`, `clients/[id]/projects/[projectId]/milestones`, `projects`, `messages`, `channels`, `analytics`, `automations`, `agents`, `chat`, `settings/{general,ai-defaults,notifications,security,danger-zone,api-keys,billing,organization,team-members,roles}` (10 sub-routes under one shell), plus `(auth)/login`, `(auth)/register`, `(auth)/auth/callback`, `forgot-password`, `reset-password`, `voxly-admin`, `docs`, and the marketing landing page (`app/page.tsx`, static, no data).

### 3.2 `lib/api.ts` Client Coverage

Every backend router except `github`/`whatsapp`/`telegram` (webhook-only, no frontend caller by design) and `super_admin` (uses its own isolated `adminApi` instance, correctly, per its own comments) has a typed client object: `authAPI`, `clientsAPI`, `projectsAPI`, `milestonesAPI`, `chatAPI`, `dashboardAPI`, `apiKeysAPI`, `billingAPI`, `notificationsAPI`, `aiKeysAPI`. One exception: `/chat` (`app/chat/page.tsx`) calls `POST /api/v1/ai/chat` via a raw `fetch()`, bypassing `lib/api.ts` entirely — inconsistent with the rest of the app, worth normalizing during any future touch of that page.

### 3.3 React Query Hook Map

| queryKey | Endpoint | Used on |
|---|---|---|
| `['clients']` | `GET /clients` | Dashboard, Clients, Projects, Analytics, Channels, Settings/Organization |
| `['projects']` | `GET /projects` | Dashboard, Clients, Projects, Analytics, Settings/Organization |
| `['projects', {client_id}]` | `GET /projects?client_id=` | Client Detail |
| `['dashboard-stats']` | `GET /dashboard/stats` | Dashboard, Analytics |
| `['client', id]` | `GET /clients/{id}` | Client Detail, Project Detail (Milestones) |
| `['project', id]` | `GET /projects/{id}` | Project Detail (Milestones) |
| `['milestones', {project_id}]` | `GET /milestones?project_id=` | Project Detail (Milestones) |
| `['messages', page]` | `GET /chat/messages` | Conversation Center |

Plus non-`useQuery` fetches (`useState`/`useEffect` or one-shot calls): API Keys settings page → `apiKeysAPI`; Billing settings page → `billingAPI`; AI Defaults settings page → `aiKeysAPI`; General/Security/Danger Zone settings → `authAPI`. **Automations, AI Agents (`/agents`), Roles & Permissions, Team Members pages issue zero network calls** — every value on screen is a local constant or a deterministic hash-based placeholder.

---

## 4. Page-by-Page Gap Audit

Ordered per the requested roadmap sequence.

### Auth (login, register, forgot/reset password, Google/GitHub OAuth callback)
**✅ Real.** Full JWT flow, Google + GitHub OAuth, password reset (email via Resend, gated on `RESEND_API_KEY` being set — logs the link instead if not configured, per CLAUDE.md history), rate-limited. No gaps against current frontend usage.

### Dashboard
🟡 **Partial.** Real: `total_clients`, `active_clients`, `total_projects`, `active_projects`, `total_messages`, `messages_this_month/last_month`, real month-over-month deltas, `messages_by_day`, `recent_activity`, `recent_ai_messages`, `integrations` status, `ai_accuracy` — all computed live in `dashboard.py` from real tables, not stubbed.
Mock (frontend-only, no backend field exists): Revenue ($48.2K), Platform Uptime, Automation Success Rate, Morning Briefing narrative (priorities/blockers/suggested actions), Today's Focus checklist, token spend/latency/queue depth in the AI Infrastructure panel.

### Clients
🟡 **Partial.** Real: full CRUD, `name`/`phone`/`email`/`company`/`telegram_chat_id`/`is_active`, channel tags (derived correctly from real fields).
Mock: per-client health score, MRR (deterministic hash placeholders, clearly commented in `app/clients/page.tsx`).
Gap: `deleted_at` soft-delete column exists on the model but `DELETE /clients/{id}` needs verification of whether it hard-deletes or sets `deleted_at` — **confirm before building any "trash/restore" UI on top of it.**

### Projects
🟡 **Partial.** Real: full CRUD, `github_repo`, `github_sync_enabled`, `status`, dates.
Mock: health score, AI Agent assignment (no `agent` concept exists on `Project` or anywhere in the schema).
Gap: `github_cache` is populated hourly but **never returned** by `GET /projects` or `GET /projects/{id}` — Project Detail's "repo overview strip" (open PRs, build status) has real data sitting in Postgres that the API simply doesn't expose yet.

### Project Detail (Milestones)
🟡 **Partial.** Real: full milestone CRUD (create/edit/delete/progress), client/project header data.
Mock: Activity Timeline, Documents section, Health Explanation panel, AI Memory & Context panel, Risks panel, repo overview strip (branch/PRs/build status) — all illustrative since no per-project activity log, document storage, or health-scoring model exists.

### Conversations (Conversation Center / `/messages`)
🟡 **Partial — corrected 2026-07-25, see §9.** Real: `chat_history` rows (client message + AI response + tokens + model), grouped client-side into conversations, search/pagination against the real paginated endpoint.
Mock: confidence %, sentiment classification, SLA countdown — none of these are computed or stored anywhere (`chat_history` has no sentiment/confidence columns, no SLA concept exists).
Status inference (Resolved/AI handling/Awaiting human) is a frontend heuristic based on `ai_response IS NULL` and message age, not a backend-computed state.
**Correction:** the original claim "real-time via `WS /chat/ws`" overstated what actually happens today — the WebSocket connection itself works, but the one broadcast call in `messaging_core.py` sends `type: "incoming_message"` while the frontend only reacts to `type === "new_message"`, so live conversation updates never actually reach the UI; see §9 for the full finding.

### Channels
🟡 **Partial.** Real: every row is derived from an actual client's `phone`/`email`/`telegram_chat_id`. No separate "channel connection" entity exists — a client having a phone number *is* the WhatsApp channel, structurally.
Mock: per-connection health score, message volume, last-activity timestamp (no per-channel metering exists; `chat_history.channel` could partially back a real "last activity" and "volume" if aggregated — currently isn't).

### Analytics
⚪ **Mostly mock.** Real: Active Clients, Active Projects (partial), AI Conversations count (`total_messages` reused from dashboard stats).
Mock: Revenue trend, Client Health distribution, AI Performance (success rate reuses real `ai_accuracy`; latency/tokens/cost are not), Automation Metrics (100% — no automation data exists), Conversation Analytics (status/sentiment/volume — no sentiment data exists), Top Clients by Revenue, Cost by Agent. There is no `/api/v1/analytics` route at all — this page reuses `dashboard.py` for the handful of real numbers it has.

### Automations
⚪ **100% mock.** No `automations` table, no route, no service. The Celery Beat scheduler (§2.5) is real and could become the execution backbone, but there is currently no workflow/trigger/condition/action data model, no run-history storage, and no approval-checkpoint concept anywhere in the backend.

### AI Agents (`/agents`)
⚪ **100% mock as a fleet dashboard.** The real backend capability behind this concept is a single tool-calling chat agent (`ai_agent.py` + `ai.py` `POST /chat`), used by the separate `/chat` page, not by `/agents`. There is no per-agent model (no "Support Agent" / "Deploy Agent" / "Triage Agent" as distinct configured entities), no prompt versioning, no deployment/test-status tracking, no reasoning-trace persistence, no fleet health/cost/queue metrics.

The real `/chat` page itself is 🟡 Partial: real message send/receive, real project-context selector (backed by real `projects` list), real tool calls (GitHub search/file/issue, local docs) — but calls the backend via a raw `fetch()` rather than `lib/api.ts`, and has no chat history persistence visible in that page (though `chat_history` rows are written server-side regardless of caller).

### Settings

| Sub-page | Status | Real | Mock |
|---|---|---|---|
| General | 🟡 Partial | `full_name`, `agency_name` (workspace name) via `PUT /auth/profile` | Timezone, date format, language (no locale-prefs model) |
| AI Defaults | 🟡 Partial | Full BYOK key CRUD (`ai-keys` router) | Default model/tone/escalation/working-hours settings (no per-workspace AI-defaults model) |
| Notifications | ⚪ Mock | — | Everything. No preferences-storage endpoint exists; `notifications.py` only sends, never stores toggles. |
| Security | 🟡 Partial | Password change (`POST /auth/change-password`) | SSO, 2FA enforcement, webhook signing toggle, IP allowlist, key-rotation reminder (no security-policy model) |
| Danger Zone | 🟡 Partial | Data export (`GET /auth/me/export`), account deletion (`DELETE /auth/me`) — both existed on the backend but were unwired in the frontend until this session | Transfer ownership (needs Organizations/Memberships to mean anything — currently a no-op single-user app) |
| API Keys | ✅ Real | Full CRUD, scopes, rotation, revoke | Only "requests (30d)" stat (no per-key request-count exposed via API, though `usage_logs.api_key_id` FK exists to compute it) |
| Billing | 🟡 Partial | Plans, subscription, usage stats, Stripe/Razorpay checkout, billing portal | Invoice history (no invoice-listing endpoint/table), payment method card display (Stripe/Razorpay hold this, never synced back), "seats" (no seats concept on `Plan` or `Subscription`) |
| Organization | ⚪ Mock, schema-ready | User's own profile fields reused for "owner"/"billing owner"/"primary contact" | Everything else — but `organizations` table + `owner_user_id` could back this almost immediately once the API layer exists |
| Team Members | ⚪ Mock, schema-ready | The single real "Owner" row = current authenticated user | The entire multi-person roster — `memberships`/`roles`/`invitations` tables are schema-complete for this exact page |
| Roles & Permissions | ⚪ Mock, schema-ready | — | Everything — but `roles.permissions` (JSON array of strings like `"client:write"`) is *already shaped* for the permission matrix this page renders |

---

## 5. Cross-Cutting Gaps (not tied to one page)

1. **Multi-tenancy is a design decision that's already been made** (per `docs/TARGET_ARCHITECTURE.md`) and is **partially executed** (per §2.6 — migrations applied, roles seeded, backfill/flag activation pending). The remaining fork in the road is narrower than "should we do this": it's (a) whether to run the remaining rollout steps (backfill → verify → flag activation) against this environment now, and (b) whether to start scoping Milestone 4 (the actual org/team/role API layer + `require(permission)` enforcement) immediately, given `PHASE1_ROLLOUT_PLAN.md` §8 explicitly gates that on a 1–2 week production soak of dual-write with defined success criteria. See the question at the end of this document.
2. **No scoring/analytics model.** Health scores (Clients, Projects, Channels), confidence/sentiment (Conversations), and most of Analytics all need either: (a) a real scoring algorithm + stored/computed field, or (b) an explicit decision to keep them illustrative long-term. Currently every one of these is a deterministic hash function in frontend code — stable-looking but not real.
3. **`deleted_at` soft-delete columns exist on `clients`/`projects` but no query filters on them** — worth confirming whether `DELETE` endpoints actually use soft-delete or hard-delete before building any recovery/trash UI.
4. **`github_cache` is a fully-populated, unused table.** Cheapest real win in this entire audit — one new response field or endpoint unlocks real repo stats on Projects and Project Detail with no new data model.
5. **Notification preferences have no persistence layer** — `notifications.py`'s own docstring documents features (history, toggles) that were never built.
6. **`/chat` bypasses `lib/api.ts`** — inconsistent with every other page; should be normalized whenever that page is next touched, independent of any backend work.

---

## 6. Implementation Roadmap (dependency-ordered)

> **Numbering note:** the phase numbers below are from this document's original audit pass and are superseded by the explicit phase order given when Backend Phase execution started: **Phase 1** = Auth validation + Organization/Workspace + RBAC + Tenant boundary validation; **Phase 2** = Clients/Projects/Milestones/Channels; **Phase 3** = Conversation runtime/Messaging/WebSocket/AI/GitHub; **Phase 4** = Automation engine; **Phase 5** = AI Agent platform; **Phase 6** = Analytics; **Phase 7** = Settings. The content of each phase below is still accurate; only the sequence/numbering changes — Organization/RBAC (originally "Phase 10") now runs first, immediately after Auth, since every other table's tenant-scoping depends on it per `docs/TARGET_ARCHITECTURE.md`.

Each phase lists the concrete backend work — new tables/migrations, new endpoints, new services — required to bring that section of the frontend from its current state to fully real. Phases assume prior phases are complete; nothing here is scheduled or estimated, this is dependency order only.

### Phase 1 — Auth
No work required. Fully real today. Included only because every later phase depends on `get_current_user`.

### Phase 2 — Dashboard
- Add `revenue`, `platform_uptime`, `automation_success_rate` fields to `DashboardStatsResponse` once Phase 6 (Billing enrichment) and Phase 8 (Automations) exist to source them from.
- Morning Briefing / Today's Focus need a real "insights" concept — likely a new lightweight `insights` or `tasks` table, or explicitly descoped to stay illustrative.

### Phase 3 — Clients
- Decide and implement real health scoring (new computed field or stored column + background recompute job).
- Add MRR — requires a per-client billing/revenue concept that doesn't exist yet (likely deferred to a future billing-per-client feature, out of scope until product decides clients are billed individually).
- Confirm/fix soft-delete behavior on `DELETE /clients/{id}`.

### Phase 4 — Projects
- **Expose `github_cache` via API** — add fields to `ProjectResponse` (or a nested `ProjectWithGitHubStats` schema already half-modeled by the existing `ProjectWithMilestones` pattern) for `open_prs`, `build_status`, `commits_last_7_days`, `progress_percent`.
- Health scoring, same decision as Clients.
- AI Agent assignment field — depends on Phase 9 (AI Agents) existing as a real concept first.

### Phase 5 — Conversations
- Add `sentiment` and `confidence` columns (or a satellite table) to `chat_history`, populated at write-time by `ai_service.py` if the AI provider can return them, or by a lightweight separate classification call.
- Define an SLA concept (likely a per-workspace setting + computed "time since last client message with no AI/human response").
- New endpoint or extension of `GET /chat/messages` to return conversation-grouped shape server-side instead of frontend `useMemo` grouping (current approach works but doesn't scale past one page of raw messages).

### Phase 6 — Channels
- Add a real "last activity" and "volume today" aggregate — a `GROUP BY client_id, channel` query against `chat_history` would back both fields with zero new tables.
- Health score, same decision as Clients/Projects.

### Phase 7 — Analytics
- New `/api/v1/analytics` router once Phases 3–6 exist to aggregate from. Revenue/Cost/Automation sections depend on Phase 8/Billing-enrichment existing first — build this phase last among the "real data" phases, even though it's listed before Automations in the requested order, because it has no independent data source of its own.

### Phase 8 — Automations
- New tables: `automations` (name, trigger type, conditions JSON, actions JSON, owner-agent FK, status), `automation_runs` (execution history, status, duration, error).
- New router `/api/v1/automations` (CRUD + trigger/pause/retry).
- Build on the existing Celery Beat infrastructure (`app/tasks/celery_app.py`) rather than introducing a second job runner.
- Approval-checkpoint concept needs a small state machine (`pending_approval` → `approved`/`rejected`) on `automation_runs`.

### Phase 9 — AI Agents
- Decide scope first: is this becoming a real multi-agent system (separate configs, prompts, deployments per agent) or should the frontend be pulled back to reflect the real single-context-agent capability? This is a product decision, not just an engineering one — flagging per the "no guessing" standing rule.
- If real: new `agents` table (name, model, system prompt, channels, status), prompt versioning (could reuse a simple version-history table), and the reasoning-trace log would need to persist `ai_agent.py`'s tool-call sequence per execution (currently logged, not stored).
- `/chat` should be migrated onto `lib/api.ts` regardless of the above decision.

### Phase 10 — Settings
- **Organization / Team Members / Roles & Permissions**: follow `docs/PHASE1_ROLLOUT_PLAN.md` §3–§6 (backfill → verify → flag activation) rather than re-deriving these steps, then build `/api/v1/organizations`, `/api/v1/memberships` (+ invitation accept/revoke flow), `/api/v1/roles` routers per the enforcement pattern in `docs/TARGET_ARCHITECTURE.md` §5 (`require(permission)` dependency). This is the single highest-leverage phase in the whole roadmap — three fully-mock pages become real off already-migrated, already-seeded schema plus routing work, no new tables needed. Respect the rollout plan's own soak-period gate (§8) before starting the API layer unless explicitly directed otherwise.
- **Notifications**: new `notification_preferences` table (or a JSON column on `users`), + `GET`/`PUT` endpoints.
- **Security**: new `security_policy` concept (SSO/2FA/webhook-signing/IP-allowlist) — likely org-scoped, so naturally sequenced after the Organizations work above.
- **Billing**: add invoice listing (Stripe/Razorpay both expose this via their own APIs — proxy rather than store), payment-method display (same), and a `max_seats` field on `Plan` + seat-counting query once Team Members is real.
- **Danger Zone**: "Transfer ownership" becomes real once Organizations/Memberships exist (`Organization.owner_user_id` reassignment).

---

## 7. Open Decisions Before Implementation

These need an explicit answer from you before Phase 8+ work starts — flagging now rather than guessing:

1. **Multi-tenancy rollout sequencing** (see §0, §2.6, §5.1): this environment is sitting exactly at the boundary between `PHASE1_ROLLOUT_PLAN.md` Phase C (migration — done) and Phase D (backfill — not started). Three sub-questions, all needing your explicit answer before any execution:
   - Is this dev database effectively this project's production/only environment (per `CLAUDE.md`'s single Cloud Run + single Supabase setup, with no separate staging confirmed), or is there a separate production you have NOT yet run the migration against?
   - Do you want the remaining rollout steps (backfill `--dry-run` → backfill → `--verify` → flag activation) executed now, following `PHASE1_ROLLOUT_PLAN.md` exactly?
   - Given that plan's own §8 gates "Milestone 4" (the org/team/role API layer — the actual work Organization/Team Members/Roles & Permissions pages need) behind a 1–2 week soak of dual-write in production: do you want that gate respected, or do you want the API layer designed/built now regardless, understanding that means diverging from the existing approved plan?
2. **Health/confidence/sentiment scoring**: **Client health score + MRR resolved 2026-07-25** (`PHASE2_IMPLEMENTATION_PLAN.md` §1.4, §12) — no stored field, no fabricated algorithm/billing model; Client health documented as a future Health Scoring Service (aggregating Conversations/Projects/Milestones/GitHub/Automations signals) to be built once those signal sources are real; MRR deferred until a billing domain is designed. **Projects and Channels health scores, and chat sentiment/confidence, remain open** — not extended by this decision.
3. **AI Agents**: real multi-agent system, or pull the `/agents` page back to reflect the real single-agent capability?
4. **Automations**: build a real workflow engine on Celery, or scope this down to a smaller set of fixed, non-configurable scheduled jobs (closer to what exists today)?

No code will be modified until you approve a plan for at least the phase(s) you want to start with.

---

## 8. Phase 1 Execution Report — 2026-07-25

**Scope executed:** the remaining `PHASE1_ROLLOUT_PLAN.md` rollout steps only (Phase D backfill → Phase E verify → Phase F flag activation for `DUAL_WRITE_ORGANIZATIONS_ENABLED`), per your confirmed answers to §7 Q1: this environment is production, and Milestone 4 (the org/team/role API layer + `require(permission)` RBAC enforcement) is deferred behind the §8 soak gate, not built this phase. No new endpoints, services, migrations, or frontend changes were made.

### Pre-flight (Phase A)

- Confirmed local `develop` HEAD includes the multitenancy commit (`15a0f97`, 2026-07-18) as an ancestor; `backend/` working tree was clean before starting.
- Ran the full backend suite: found and fixed one **pre-existing, unrelated** bug — `backend/app/services/cache_service.py:85` used a strict `>` comparison in `_mem_get`'s TTL-expiry check, inconsistent with the `<=` convention `_mem_set`'s eviction logic already used. On Windows, `time.monotonic()`'s ~15ms tick resolution let a `ttl=0` entry set-and-read inside the same tick read back as not-expired, flaking `test_memory_ttl_expires`. Fixed (`>` → `>=`) and committed separately: `d3430d3 fix: correct off-by-one in in-memory cache TTL expiry check` (you approved committing this before deploy). **122/122 tests passing** after the fix. No backend ruff/pyright lint or typecheck gate exists in this repo's CI today, so none was run.

### Deploy state verification

- Live Cloud Run revision at session start (`voxly-backend-00013-rs9`, built 2026-07-22T18:20:42Z via `--source` upload) could not be cryptographically tied to a specific git commit — `gcloud run deploy --source` uploads a local directory tarball, so Cloud Build carries no `COMMIT_SHA`. Per your direction ("redeploy to be safe"), ran a fresh deploy from current `develop` (flags untouched) rather than assuming.
- **Action:** `gcloud run deploy voxly-backend --source ./backend --region us-central1 --project voxly-491010` → new revision `voxly-backend-00014-6sh`, 100% traffic, `GET /health` → `200 {"status":"healthy"}`. Confirmed `DUAL_WRITE_ORGANIZATIONS_ENABLED`/`DUAL_READ_SHADOW_VERIFY_ENABLED` still absent from the revision's env (both default `False`) — dual-write remained inert through this step, as intended.

### ⚠️ Secret exposure during this session

Checking the pre-existing revision's env vars (to determine deploy state) printed the **full production secret set** into this conversation in plaintext: `DATABASE_URL` (incl. DB password), JWT `SECRET_KEY`, Anthropic/OpenAI/Gemini API keys, Twilio auth token, Redis URL (with embedded credentials), GitHub PAT, Google/GitHub OAuth client secrets, `RESEND_API_KEY`, `SUPER_ADMIN_SECRET`, and webhook secrets. **Recommend rotating all of these** (Supabase DB password, JWT signing key, all AI provider keys, Twilio, Upstash Redis token, GitHub token, both OAuth client secrets, Resend, super-admin secret, webhook secrets) and updating Cloud Run's env accordingly — this has not been done yet and is independent of the Phase 1 work itself.

### Backfill (Phase D) — production database

- `--dry-run`: 14 users → 14 orgs, 14 memberships to create; row-stamping scope: `clients` 4, `api_keys` 1, `projects` 3, (`subscriptions`/`usage_logs`/`user_ai_keys` 0).
- You confirmed proceeding with the real write. Executed `python -m app.scripts.backfill_organizations --yes`: completed in 5.9s, results matched the dry-run exactly — 14 organizations created, 14 memberships created, 4/1/3 rows stamped as predicted.

### Verify (Phase E)

- `--verify`: **all 8 checks passed** — zero `org_id IS NULL` rows across `clients`/`subscriptions`/`api_keys`/`usage_logs`/`user_ai_keys`/`projects`; zero users without an owned organization; zero organizations missing an owner membership.
- Additionally ran the §7 duplicate-owner monitoring query (`organizations.owner_user_id` has no unique constraint by design) directly against production: **0 organizations with a duplicate owner.**

### Flag activation (Phase F)

- You confirmed activating `DUAL_WRITE_ORGANIZATIONS_ENABLED`. Ran `gcloud run services update voxly-backend --update-env-vars DUAL_WRITE_ORGANIZATIONS_ENABLED=True` → new revision `voxly-backend-00015-gdt`, 100% traffic, `GET /health` → `200`. Confirmed the env var is present on the new revision (name only checked, not value, to avoid repeating the secret-exposure issue above). `DUAL_READ_SHADOW_VERIFY_ENABLED` left off, as directed. No `ERROR`-severity logs on the new revision in the 10 minutes following activation.
- **Dual-write is now live in production.** The 1–2 week soak period referenced in `PHASE1_ROLLOUT_PLAN.md` §8 starts now (2026-07-25).

### Current production state (end of Phase 1)

| Item | State |
|---|---|
| Cloud Run revision | `voxly-backend-00015-gdt`, 100% traffic |
| Migrations | `01abb4f68454` (head) — unchanged this phase |
| `organizations` / `memberships` | 14 / 14 (backfilled) |
| `DUAL_WRITE_ORGANIZATIONS_ENABLED` | **True** |
| `DUAL_READ_SHADOW_VERIFY_ENABLED` | False (deferred) |
| Org/RBAC API layer (Milestone 4) | **Not built** — deferred behind soak gate per your direction |
| Backend tests | 122/122 passing |

### Deviations from the original rollout plan

None in substance. One addition: a redeploy (Phase B, effectively re-run) was performed even though the code had likely already been live since before this session, purely to remove uncertainty about deploy/git-state correlation — this was your explicit choice among the offered options, not a plan change.

### Open risks carried forward

- Production secrets were exposed in this session's transcript (see above) — rotation recommended, not yet done.
- Soak period (§8) has just started; success criteria (sustained 1–2 week soak, clean `--verify`, zero unexplained `tenant_resolution_failure_count`, self-heal flattened to zero, no duplicate-org races, no user-visible incidents) are not yet met — Milestone 4 (org/team/role API + RBAC enforcement) stays deferred until they are.
- `organizations.owner_user_id` still has no unique constraint (accepted trade-off, monitored via the query re-run above) — re-check periodically during the soak per §7.
- Local `develop` is one commit ahead of `origin/develop` (`d3430d3`, the cache fix) — not pushed, per standing "don't push without being asked" policy.

**Phase 1 (rollout-execution scope) is complete.** Stopping here per your instruction to provide a verification report before continuing to Phase 2 (Clients, Projects, Milestones, Channels).

---

## 9. Phase 3 Pre-Implementation Audit — Conversation Runtime — 2026-07-25

Per your instruction, audited every file below before writing any Phase 3 code. Two corrections to prior claims (both already applied inline in §4 and here); everything else in the original audit held up.

### 9.1 Files audited
`app/models/chat_history.py`, `app/services/messaging_core.py`, `app/services/ai_service.py`, `app/services/ai_agent.py`, `app/api/v1/chat.py`, `app/websockets/manager.py`, `app/api/v1/whatsapp.py`, `app/api/v1/telegram.py`, `app/services/github_service.py`, `app/services/cache_service.py`, `app/services/notification_service.py`, `frontend/app/messages/page.tsx`, `frontend/hooks/useWebSocket.ts`, `frontend/lib/api.ts` (`chatAPI`), and the full `backend/tests/` directory listing.

### 9.2 Correction #1 — WebSocket event-type mismatch (real-time is currently non-functional)
`messaging_core.py`'s `_broadcast_incoming` (the **only** `manager.broadcast()` call site in the entire backend — verified via grep) sends:
```python
{"type": "incoming_message", "message": {"client_id", "client_name", "message", "channel"}}
```
`frontend/app/messages/page.tsx`'s WebSocket handler only reacts to:
```ts
if (lastMessage.type === 'new_message') { ... }
```
The type strings never match, so the Conversation Center's live-update code path (`useEffect` on `lastMessage`) never fires. There is also no `refetchInterval` on the messages query, so nothing else compensates — a new incoming message only appears after a manual page reload today. Two further problems in the same call site, useful context for Milestone 1/4 design:
- It fires **before** the AI response is generated or saved — the payload structurally cannot carry the reply even if the type matched.
- Its payload shape doesn't match the frontend's `ChatMessage` interface at all (no `id`, no `ai_response`, no `created_at`).

### 9.3 Correction #2 — Field-name mismatch hides the AI reply in the UI
`chat.py`'s `GET /messages` serializes each row with a `response` key (matching the `ChatHistory.response` column name). `frontend/app/messages/page.tsx`'s `ChatMessage` interface and render logic reads `m.ai_response` (`{m.ai_response && (...)}`, twice). Since the API client does a bare `as` type-cast with no runtime mapping, `m.ai_response` is `undefined` for every real message — **the AI's actual reply text never renders in the conversation thread today**, despite being present in the API response under a different key. This is independent of the WebSocket issue above; it affects the initial paginated load too, not just real-time updates.

### 9.4 Confirmed-accurate findings (no correction needed)
- Conversation status (`Resolved`/`AI handling`/`Awaiting human`) is 100% a frontend heuristic (`inferStatus()`, based on `ai_response IS NULL` + message age) — no backend state exists. Confirmed accurate; this is exactly Milestone 1's target.
- Confidence and sentiment are 100% mock (`mockConfidence`/`mockSentiment`, hash-based, explicitly commented as such in the frontend). Confirmed accurate; Milestone 2's target.
- `GET /api/v1/chat/messages` paginates at the **message** level, not the **conversation** level. The frontend groups whatever page of raw messages it has into client-keyed "conversations" client-side, so the displayed "N conversations" count and the conversation list itself are artifacts of pagination — a client with older messages that fell off the current page simply disappears from the list, and a client with many messages can dominate a page. Confirmed as a real, current limitation; Milestone 3's target.
- GitHub context loading (`github_service.py` + `cache_service.py`) is real (live PyGithub calls, 1-hour TTL cache with Redis+in-memory fallback, circuit breaker) — no fabrication found. Feeds into AI context (`messaging_core.py`) correctly.
- `ai_service.py`'s provider fallback chain (Claude → OpenAI → Gemini) and `ai_agent.py`'s ReAct tool-calling loop are both real, already covered by `test_ai_agent.py`/`test_ai_integration.py`/`test_ai_providers.py` at a mocked level.

### 9.5 New finding — test coverage gap
Full `tests/` directory confirmed via `ls`: `test_ai_chat.py`/`test_ai_agent.py`/`test_ai_integration.py`/`test_ai_providers.py` cover the **admin** agent chat path (`POST /api/v1/ai/chat`, `VoxlyAgent`, provider layer) at a mocked level. **Zero test coverage exists** for `messaging_core.py`, `chat.py`'s `/history/{client_id}`/`/messages`/`/ws` endpoints, `whatsapp.py`, or `telegram.py` — the entire client-facing conversation runtime pipeline that this phase is about to modify. No test file for any of these exists today.

### 9.6 `useWebSocket.ts` — pre-existing frontend bug, noted not fixed
Already surfaced in the Phase 2 Milestone 1 lint baseline: `connect` is referenced inside its own `useCallback` body (via the reconnect `setTimeout(connect, delay)` in `onclose`) before the `const connect = useCallback(...)` assignment completes, flagged by `react-hooks/immutability` as an **error** (not just a warning). Pre-existing, unrelated to any change made so far. Directly relevant to Milestone 4 (Realtime/reconnect behavior) — flagging now so it's a deliberate decision at that point whether fixing it counts as "absolutely required by an API contract" (reconnect correctness arguably is, once the backend side of realtime is fixed) rather than out-of-scope frontend modification.

### 9.7 Net effect on the roadmap
None of this changes Milestone order or scope — if anything it confirms Milestones 1-4 are targeting real, verified problems rather than assumed ones. It does mean Milestone 1 (Conversation State) and Milestone 4 (Realtime) are more tightly coupled than the roadmap text alone suggests: a backend-computed conversation state is most useful to broadcast in real-time, and fixing the broadcast requires fixing both the event type and the payload shape (§9.2) plus firing a second broadcast after the AI reply is saved, not just the incoming message. Flagging this coupling now; Milestone 1 will implement the state model and storage, Milestone 4 will fix the broadcast wiring — sequenced as instructed, not collapsed into one milestone.
