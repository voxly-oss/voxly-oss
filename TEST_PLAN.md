# Voxly — Production Acceptance Test Plan

**Version:** 1.0
**Date:** 2026-07-27
**Author:** Principal QA Engineer / Product Owner (acceptance audit)
**Branch under test:** `develop` @ `1907890`
**Scope:** Full-platform end-to-end verification. No code was modified during this audit.

---

## 1. Purpose & Method

This document is the complete acceptance test plan for the Voxly platform, plus the
executed result of every test in it. It exists to answer one question honestly:
**what actually works today, and what only looks like it works?**

Three classification rules govern every verdict:

1. A feature that is **advertised as available and does not work** is `FAIL` / `Broken`.
2. A feature that is **deliberately marked unavailable in the UI** (disabled button,
   `PreviewBanner`, "not available yet" copy) is **not** broken. It is
   `Coming Soon`, `Preview`, `Planned`, or `Mock UI`.
3. A feature whose backend is complete but which no UI consumes — or vice versa — is
   `Backend only` / `Frontend only`, never `Working`.

### 1.1 Test lanes

| Lane | Configuration | Why it matters |
|---|---|---|
| **L1 — Repo unit/integration** | `pytest tests/` on default in-memory SQLite | The lane a developer runs locally |
| **L2 — Repo unit/integration (CI-equivalent)** | `pytest tests/` against `postgres:16-alpine`, `DATABASE_URL` set | Matches `.github/workflows/ci.yml` and production engine |
| **L3 — Acceptance harness** | 169 purpose-written black-box API tests via `TestClient`, Postgres 16, all outbound side effects stubbed | Feature-level acceptance, cross-tenant, security |
| **L4 — Security probes** | 9 targeted auth/session/rate-limit probes, Postgres 16 | Session, token, and throttle semantics |
| **L5 — Frontend static** | `tsc --noEmit`, `eslint .`, `next build` | Build/type integrity of 32 routes |
| **L6 — Frontend E2E** | `playwright test --project=chromium` (46 specs) | Rendered-UI behaviour |
| **L7 — Production probe** | Live HTTP against Cloud Run + Vercel | Deployed reality, headers, CORS, auth gates |

> **L3/L4 isolation note.** The harness stubs `whatsapp_service.send_whatsapp_message`
> and never points at the production Supabase database. L1/L2 (the repo's own suite)
> do **not** stub it — see `DEBT-02`.

### 1.2 Severity scale

| Level | Meaning |
|---|---|
| **P0 — Production blocker** | Ships broken revenue, data-integrity, or availability behaviour. Must fix before v1.0.0. |
| **P1 — High** | Security weakness or user-visible incorrectness with a workaround. |
| **P2 — Medium** | Correctness/robustness gap, or process/technical debt. |
| **P3 — Low** | Cosmetic, stale docs, lint. |

---

## 2. Discovery — System Inventory

### 2.1 Backend surface (68 routes across 15 routers)

Registered in `backend/app/main.py`. `/voxly-admin/*` is excluded from the OpenAPI
schema (verified: `M6 PASS`).

| Router | Prefix | Endpoints |
|---|---|---|
| Authentication | `/api/v1/auth` | `POST /register`, `POST /login`, `POST /refresh`, `GET /me`, `PUT /profile`, `POST /change-password`, `POST /password-reset/request`, `POST /password-reset/confirm`, `GET /me/export`, `DELETE /me`, `POST /google`, `GET /github`, `POST /github/callback` |
| Clients | `/api/v1/clients` | `GET ""`, `POST ""`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` |
| Projects | `/api/v1/projects` | `GET ""`, `POST ""`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` |
| Milestones | `/api/v1/milestones` | `GET ""`, `POST ""`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` |
| Chat / Conversations | `/api/v1/chat` | `WS /ws`, `GET /history/{client_id}`, `GET /messages`, `GET /conversations`, `GET /conversations/{client_id}/status`, `PATCH /conversations/{client_id}/status` |
| Channels | `/api/v1/channels` | `GET ""` |
| Dashboard | `/api/v1/dashboard` | `GET /stats` |
| AI Agent | `/api/v1/ai` | `POST /chat` |
| AI Keys (BYOK) | `/api/v1/ai-keys` | `GET /providers`, `GET /`, `POST /`, `DELETE /{id}`, `POST /{id}/validate` |
| API Keys | `/api/v1/api-keys` | `POST /`, `GET /`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`, `POST /{id}/rotate` |
| Billing | `/api/v1/billing` | `GET /plans`, `GET /subscription`, `POST /checkout`, `GET /usage`, `POST /portal`, `POST /webhook/stripe`, `POST /webhook/razorpay` |
| Notifications | `/api/v1/notifications` | `POST /send` |
| WhatsApp | `/api/v1/whatsapp` | `POST /webhook`, `GET /webhook` |
| Telegram | `/api/v1/telegram` | `POST /webhook`, `GET /webhook` |
| Super Admin | `/voxly-admin` | `GET /tenants`, `GET /tenants/{user_id}`, `GET /stats`, `GET /activity`, `PATCH /users/{id}/plan`, `PATCH /users/{id}/disable`, `POST /impersonate/{id}` |
| GitHub | `/api/v1/github` | `POST /webhook` |
| Platform | `/` | `GET /`, `GET /health` |

**No `organizations` / `members` / `invitations` / `roles` router exists.** The
organization data layer (models, migrations, dual-write, shadow-read) is complete;
no REST surface is exposed. Verified: `Q2 NOT IMPLEMENTED`.

### 2.2 Frontend surface (32 routes, all building)

| Group | Routes |
|---|---|
| Public | `/`, `/docs`, `/not-found` |
| Auth | `/login`, `/register`, `/auth/callback`, `/forgot-password`, `/reset-password` |
| Core app | `/dashboard`, `/clients`, `/clients/new`, `/clients/[id]`, `/clients/[id]/projects/[projectId]/milestones`, `/projects`, `/messages`, `/chat` |
| AI Work OS | `/agents`, `/automations`, `/analytics`, `/channels` |
| Settings (9) | `/settings` → `/settings/general`, `/settings/ai-defaults`, `/settings/notifications`, `/settings/organization`, `/settings/team-members`, `/settings/roles`, `/settings/api-keys`, `/settings/billing`, `/settings/security`, `/settings/danger-zone` |
| Admin | `/voxly-admin` |

### 2.3 Database schema (17 tables)

`users`, `organizations`, `memberships`, `roles`, `invitations`, `clients`,
`projects`, `milestones`, `chat_history`, `conversation_states`, `github_cache`,
`api_keys`, `user_ai_keys`, `plans`, `subscriptions`, `usage_logs`, `alembic_version`.

Migration chain: 16 revisions, single head `5b8e3c1f9a2d`. **Verified: applies
cleanly from an empty schema to head on Postgres 16.**

### 2.4 Integrations

Twilio WhatsApp (inbound webhook + outbound), Telegram Bot API, GitHub (webhook +
REST via `github_service`), Stripe, Razorpay, Resend (email), Upstash Redis
(usage metering + cache), OpenAI / Anthropic / Gemini (AI providers, platform key
and BYOK), Celery + Redis (scheduled GitHub sync), Sentry (frontend).

### 2.5 Feature flags (`backend/app/config.py`)

| Flag | Default | Production (`env.yaml`) |
|---|---|---|
| `DUAL_WRITE_ORGANIZATIONS_ENABLED` | `False` | `true` |
| `DUAL_READ_SHADOW_VERIFY_ENABLED` | `False` | `true` |
| `VOICE_TRANSCRIPTION_ENABLED` | `False` | *unset → off* |
| `LANGUAGE_DETECTION_ENABLED` | `False` | *unset → off* |
| `DEBUG` | `False` | `false` |

---

## 3. Feature Test Plan & Executed Results

Each feature below carries the full required schema. **Result** is the executed verdict.

---

### F-01 · Email/Password Registration

- **Purpose:** Let an agency owner create a Voxly account.
- **Status:** Working
- **Backend:** `POST /api/v1/auth/register`
- **Frontend:** `/register`
- **Tables:** `users`, `organizations`, `memberships`, `roles`
- **Dependencies:** bcrypt, Postgres, tenant dual-write (when flag on)
- **Expected:** 201 with the user object, no secret material; duplicate email → 400; malformed email or <8-char password → 422; a personal `organizations` row and owner `memberships` row are created when dual-write is on.
- **Actual:** Matches expected on every case.
- **Test cases:** A1 (201), A2 (no hash in body), A3 (duplicate → 400), A4 (bad email → 422), A5 (weak password → 422), Q1 (org auto-created).
- **Edge cases:** Duplicate email under concurrent submit — sequential-retry safe; true concurrency relies on the DB unique index (present).
- **Security cases:** A2 — response body contains no `hashed_password`/`password` key.
- **Multi-tenant cases:** Q1 — each registration produces exactly one owner org.
- **Mobile cases:** Form renders single-column ≤640px; verified in `next build` static output and responsive class audit.
- **Production verification:** `POST https://voxly-backend-…/api/v1/auth/register` with a throwaway address; confirm the row and org exist, then delete via `DELETE /auth/me`.
- **Result: PASS** (6/6)

---

### F-02 · Email/Password Login (JWT)

- **Purpose:** Issue a bearer token for the dashboard and WebSocket.
- **Status:** Working
- **Backend:** `POST /api/v1/auth/login` (form-encoded, OAuth2 password flow)
- **Frontend:** `/login`, `hooks/useAuth.tsx`, `lib/api.ts` interceptor
- **Tables:** `users`
- **Dependencies:** PyJWT (HS256), `SECRET_KEY`, slowapi
- **Expected:** 200 + `access_token` on valid credentials; 401 on wrong password or unknown user (indistinguishable); throttled after ~10/min.
- **Actual:** Matches expected. Token carries `iss=voxly_api`, `aud=voxly_frontend`, both verified on decode.
- **Test cases:** A6, A7, A8, A9 (`/me` round-trip), O8 (rate limit).
- **Edge cases:** Deactivated user → 403 via `get_current_user`'s `is_active` check.
- **Security cases:** A10 (no token → 401), A11 (malformed → 401), A12 (tampered signature → 401), O8 (15 rapid bad logins produce 429).
- **Multi-tenant cases:** Token binds to `sub=user_id`; every downstream query filters on it.
- **Mobile cases:** Password visibility toggle present (`auth.spec.ts` PASS).
- **Production verification:** Login at `https://voxly-oss.vercel.app/login`; confirm `access_token` in localStorage and `/dashboard` loads.
- **Result: PASS** (8/8)

---

### F-03 · Session Lifecycle (refresh, logout, revocation)

- **Purpose:** Keep a session alive; end it when credentials change.
- **Status:** **Partially Working**
- **Backend:** `POST /api/v1/auth/refresh`
- **Frontend:** `authAPI.refresh()`, 401 response interceptor → `/login`
- **Tables:** `users`
- **Dependencies:** PyJWT
- **Expected:** Refresh mints a new token. **Changing the password should invalidate every previously issued token.** Refresh should be throttled.
- **Actual:** Refresh works. **Password change does NOT revoke existing tokens** — the pre-change JWT keeps authenticating for its full `ACCESS_TOKEN_EXPIRE_MINUTES`. Refresh has **no rate limit** (40 consecutive calls all returned 200).
- **Test cases:** A14 (refresh 200) **PASS**; S1 (old token revoked) **FAIL**; S4 (refresh throttled) **FAIL**.
- **Edge cases:** No `jti`, no token version column, no denylist — revocation is architecturally impossible today.
- **Security cases:** S1 — an attacker holding a stolen token survives the victim's password reset. **`BUG-08`, P1.**
- **Multi-tenant cases:** n/a
- **Mobile cases:** n/a
- **Production verification:** Log in on two devices, change the password on one, confirm the other is still authorised (reproduces the defect).
- **Result: PARTIAL** (1/3)

---

### F-04 · Change Password

- **Purpose:** Let a signed-in user rotate their password.
- **Status:** Working *(see F-03 for the revocation gap)*
- **Backend:** `POST /api/v1/auth/change-password`
- **Frontend:** `/settings/security` (zod: ≥8 chars, upper, lower, digit, match)
- **Tables:** `users`
- **Expected:** Wrong current password → 400/401; success → 200 and the new password logs in.
- **Actual:** Matches.
- **Test cases:** A15, A16, A17.
- **Security cases:** Old-password verification enforced server-side, not only in the form.
- **Result: PASS** (3/3)

---

### F-05 · Password Reset (request → email → confirm)

- **Purpose:** Recover an account without support intervention.
- **Status:** **Partially Working**
- **Backend:** `POST /api/v1/auth/password-reset/request`, `POST /api/v1/auth/password-reset/confirm`
- **Frontend:** `/forgot-password`, `/reset-password`
- **Tables:** `users`
- **Dependencies:** Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`), PyJWT 15-min token
- **Expected:** Request always returns 200 (no email enumeration) and dispatches a Resend email; the token is **single-use**, expires in 15 min, and confirm is throttled.
- **Actual:** Enumeration protection works; Resend is genuinely wired (no longer console-only). But:
  - The token is a **stateless JWT with no `jti` and no invalidation** — it can be redeemed repeatedly for the full 15 minutes (`S2`: first 200, replay 200).
  - `/password-reset/confirm` carries **no rate limit** (25 consecutive attempts, no 429).
  - **`RESEND_FROM_EMAIL` is absent from production `env.yaml`**, so the sender falls back to `onboarding@resend.dev`, which Resend only permits delivering to the account owner. Real users' reset emails will not arrive.
- **Test cases:** A18, A19, A20 **PASS**; S2, S3 **FAIL**.
- **Edge cases:** Confirm on a deleted user → 404. Expired token → 400.
- **Security cases:** S2 (`BUG-09`, P1), S3 (`BUG-09`, P1). Token is not bound to the current password hash, so it survives an intervening password change.
- **Multi-tenant cases:** Token `sub` is the email; scoped to one user.
- **Mobile cases:** Both pages render single-column.
- **Production verification:** Request a reset for a non-owner address on the live deployment and confirm no email arrives (reproduces `BUG-06`).
- **Result: PARTIAL** (3/5)

---

### F-06 · Google OAuth Sign-in

- **Purpose:** One-click sign-up/sign-in with a Google account.
- **Status:** Working *(live round-trip not exercised — requires a real Google ID token)*
- **Backend:** `POST /api/v1/auth/google`
- **Frontend:** `/login`, `/register` Google buttons
- **Tables:** `users` (`google_id`)
- **Dependencies:** `google-auth`, `GOOGLE_CLIENT_ID` (present in `env.yaml`)
- **Expected:** Invalid/forged ID token → 400/401; valid token creates or links a user.
- **Actual:** Invalid token correctly rejected. The success path could not be exercised without a genuine Google-signed token.
- **Test cases:** A23 **PASS**. Happy path **BLOCKED — needs manual production verification.**
- **Security cases:** Token is verified against `GOOGLE_CLIENT_ID`, not trusted blindly.
- **Production verification:** Click "Continue with Google" on `voxly-oss.vercel.app/login`; confirm a `users` row with a populated `google_id`.
- **Result: PASS** (1/1 automated; 1 manual step outstanding)

---

### F-07 · GitHub OAuth Sign-in (with CSRF state binding)

- **Purpose:** One-click sign-in with GitHub.
- **Status:** Working
- **Backend:** `GET /api/v1/auth/github` (redirect + state cookie), `POST /api/v1/auth/github/callback`
- **Frontend:** `/login`, `/register`, `/auth/callback`
- **Tables:** `users` (`github_id`)
- **Dependencies:** `GITHUB_OAUTH_CLIENT_ID/SECRET` (both present in `env.yaml`)
- **Expected:** `/github` 302s to `github.com/login/oauth/authorize` and sets an `httponly` state cookie; the callback rejects any `state` not matching that cookie.
- **Actual:** Matches. `secure` is set conditionally on request scheme.
- **Test cases:** A22 (302 + correct `Location`), A22b (`httponly` cookie set), A24 (unbound state → 400/401).
- **Edge cases:** Unconfigured instance → 503 (not a crash).
- **Security cases:** A24 — the CSRF state binding from the 2026-03-01 hardening is intact and enforced. **No rate limit on the callback** (`S6 FAIL`, `BUG-16`, P2).
- **Production verification:** Complete the GitHub flow end-to-end on the live URL.
- **Result: PASS** (3/3; one P2 throttle gap)

---

### F-08 · GDPR Data Export

- **Purpose:** Give a user a machine-readable copy of their data.
- **Status:** Working
- **Backend:** `GET /api/v1/auth/me/export` (5/min)
- **Frontend:** `/settings/danger-zone` → downloads `voxly-export-YYYY-MM-DD.json`
- **Tables:** `users`, `clients`, `projects`, `user_ai_keys`, `api_keys`
- **Expected:** Returns clients, projects, and AI-key *metadata* — never secret material.
- **Actual:** Matches.
- **Test cases:** A21, P1 (clients + projects present) **PASS**.
- **Security cases:** S8 **PASS** — export body contains no `password_hash`, no `api_key_encrypted`, no `key_hash`.
- **Multi-tenant cases:** Scoped to `current_user.id` only.
- **Result: PASS** (3/3)

---

### F-09 · Account Deletion (hard, transactional)

- **Purpose:** GDPR erasure — permanently remove the account and every dependent row.
- **Status:** Working
- **Backend:** `DELETE /api/v1/auth/me` (2/min)
- **Frontend:** `/settings/danger-zone` with a typed `DELETE` confirmation
- **Tables:** all 16 application tables
- **Dependencies:** Postgres `ON DELETE CASCADE`, row-level `FOR UPDATE` lock, `RESTRICT` FK ordering
- **Expected:** 204; `users`, `organizations`, `memberships`, `clients`, `projects`, `milestones`, `github_cache`, `chat_history`, `conversation_states`, `api_keys`, `user_ai_keys`, `subscriptions`, `usage_logs` all gone; the token stops working; an org with another member → 409.
- **Actual:** Matches on Postgres. The `FOR UPDATE` lock, the `RESTRICT`-ordered bulk deletes, and the cascade all behave as designed.
- **Test cases:** P2–P7 **PASS** (6/6), plus the repo's 7 `test_account_deletion.py` integration tests **PASS on L2**.
- **Edge cases:** Concurrent `tenant_context` self-heal creating a new org mid-delete is blocked by the `FOR KEY SHARE` conflict.
- **Security cases:** Confirmation dialog is client-side only, but the endpoint is authenticated and rate-limited to 2/min.
- **Multi-tenant cases:** Deleting tenant A leaves tenant B untouched.
- **Known lane artefact:** On **L1 (default local SQLite)** 2 of these tests **FAIL** because SQLite does not enforce foreign keys without `PRAGMA foreign_keys=ON`, so `ON DELETE CASCADE` never fires. Re-running L1 with the pragma enabled: **7/7 PASS**. This is a harness gap (`DEBT-01`), not a product defect — and it contradicts the file's own docstring, which claims those tests "will pass identically" on SQLite.
- **Production verification:** Create a throwaway account with a client + project on the live deployment, delete it, and confirm via Supabase that all rows are gone.
- **Result: PASS** (13/13 on the production engine)

---

### F-10 · Transfer Organization Ownership

- **Purpose:** Hand the Owner role to another member before leaving.
- **Status:** **Coming Soon** — button rendered disabled with `title="No other members exist yet"`.
- **Backend:** none
- **Frontend:** `/settings/danger-zone`
- **Expected:** Correctly unavailable while there is no membership/team API.
- **Result: NOT IMPLEMENTED (intentional — Coming Soon)**

---

### F-11 · Client CRUD

- **Purpose:** Manage the agency's customer records — the platform's root entity.
- **Status:** **Partially Working**
- **Backend:** `GET/POST /api/v1/clients`, `GET/PUT/DELETE /api/v1/clients/{id}`
- **Frontend:** `/clients`, `/clients/new`, `/clients/[id]`
- **Tables:** `clients` (soft delete via `deleted_at`)
- **Dependencies:** tenant dual-write, WhatsApp notification hook
- **Expected:** Full CRUD scoped to the caller; phone unique **per tenant**; invalid phone rejected; over-length input rejected cleanly; soft delete removes the row from every list and count.
- **Actual:** CRUD, ownership scoping, and soft-delete-from-lists all work. Four real defects:
  1. **`clients.phone` is `unique=True` at the table level — globally, across every tenant.** The application-level check is correctly scoped to `current_user.id`, but the DB constraint is not. Agency B **cannot onboard a client whose phone number Agency A already holds** (`B4`: 409). Because a soft-deleted client keeps its row, a deleted number is also permanently unusable by anyone, including its original owner. **`BUG-04`, P0.**
  2. The 409 body for a phone collision reads **"This Telegram Chat ID is already linked to another client."** The handler matches `"telegram" in str(e).lower()`, and the SQLAlchemy exception string embeds the full `INSERT` column list — which contains `telegram_chat_id`. The wrong branch always wins. **`BUG-14`, P1.**
  3. **No phone validation at all.** `ClientCreate.phone` is a bare `str`; `"12345"` is accepted (`B5`: 201). `app/utils/phone.py::normalize_phone` exists, is correct, and is **called from nowhere in the codebase** — dead code. **`BUG-13a`, P1.**
  4. A `name` longer than 255 chars returns **HTTP 500** (`{"detail":"Failed to create client: DataError"}`) instead of a 422 (`B5b`). **`BUG-13`, P1.**
- **Test cases:** B1, B2, B3, B6, B10, B11, B12, B13 **PASS**; B4, B4b, B5, B5b **FAIL**.
- **Edge cases:** Nonexistent id → 404; malformed UUID → 422; soft-deleted client excluded from `GET /clients`.
- **Security cases:** B4 also constitutes a **cross-tenant existence oracle** — a 409 tells agency B that some other agency already registered that number.
- **Multi-tenant cases:** B7, B8, B9 **PASS** — cross-tenant GET/PUT/DELETE all return 404 (not 403, so no existence leak there).
- **Mobile cases:** `/clients` table wraps in `overflow-x-auto`; detail page stacks below `xl`.
- **Production verification:** With two accounts, add the same phone number to each — the second gets a 409 with the wrong error text.
- **Result: PARTIAL** (8/12)

---

### F-12 · Client Health Score & MRR

- **Purpose:** Surface which client relationships are at risk and what they're worth.
- **Status:** **Mock UI** — `mockHealth()` / `mockMRR()`, deterministic hashes of the client id, flagged with `<PreviewBadge/>` and `<PreviewMark/>`.
- **Backend:** none (no health-scoring or MRR endpoint exists)
- **Frontend:** `/clients` (Health Distribution, Top by Revenue panels), `/projects`, `/channels`
- **Expected:** Correctly labelled as Preview.
- **Actual:** Every mock tile carries a visible Preview marker.
- **Result: NOT IMPLEMENTED (intentional — Preview / Mock UI)**

---

### F-13 · Project CRUD & GitHub Linking

- **Purpose:** Track delivery work per client and bind it to a repository.
- **Status:** Working
- **Backend:** `GET/POST /api/v1/projects`, `GET/PUT/DELETE /api/v1/projects/{id}`
- **Frontend:** `/projects`, `/clients/[id]`
- **Tables:** `projects`, `github_cache`
- **Expected:** CRUD scoped through the owning client; `?client_id=` filter; `github_stats` present on the response; project for a nonexistent/foreign client → 404.
- **Actual:** Matches on every case.
- **Test cases:** C1, C3, C6, C7, C8, C9, C10 **PASS**.
- **Multi-tenant cases:** C2, C4, C5 **PASS** — cannot create under, list, or read another tenant's project.
- **Mobile cases:** Project cards reflow to one column below `md`.
- **Result: PASS** (10/10)

---

### F-14 · Milestone CRUD & Progress Notification

- **Purpose:** Break a project into client-visible checkpoints and notify on completion.
- **Status:** Working
- **Backend:** `GET/POST /api/v1/milestones`, `GET/PUT/DELETE /api/v1/milestones/{id}`
- **Frontend:** `/clients/[id]/projects/[projectId]/milestones`
- **Tables:** `milestones` (soft delete)
- **Expected:** CRUD scoped through project → client → user; `DELETE` soft-deletes (204) and the row disappears from the list; setting `status=completed` fires a WhatsApp progress message.
- **Actual:** Matches.
- **Test cases:** D1, D3, D5, D6, D7 **PASS**.
- **Multi-tenant cases:** D2, D4 **PASS**.
- **Result: PASS** (7/7)

---

### F-15 · Conversation List & History (backend)

- **Purpose:** Serve the Conversation Center — one row per client, server-side grouped.
- **Status:** **Backend only**
- **Backend:** `GET /api/v1/chat/messages`, `GET /api/v1/chat/history/{client_id}`, `GET /api/v1/chat/conversations`
- **Frontend:** `/messages` calls **only** `chatAPI.allMessages()` (`/chat/messages`)
- **Tables:** `chat_history`, `conversation_states`, `clients`, `projects`, `github_cache`
- **Expected:** `/conversations` groups server-side with `?search=` and `?status=` filters and real pagination over conversations; `/messages` paginates at message level with a clamped limit.
- **Actual:** All three endpoints work exactly as designed. **`GET /chat/conversations` is not referenced anywhere in the frontend** — it is absent from `lib/api.ts` and from every page. `/messages` therefore still groups client-side over whatever page of raw messages happened to load, which is precisely the artefact the Phase 3 Milestone 3 endpoint was built to remove.
- **Test cases:** E1, E3, E4, E6, E7, E8, E14 **PASS**.
- **Edge cases:** E3 — `limit=500` is clamped to ≤100; `skip` is floored at 0 (`/chat` **does** clamp, unlike `/clients`).
- **Multi-tenant cases:** E2, E5 **PASS**.
- **Production verification:** `curl` `/api/v1/chat/conversations` with a real token and compare against what `/messages` renders.
- **Result: PASS (backend) / NOT WIRED (frontend)** — 7/7 backend tests pass; **`GAP-01`, P2.**

---

### F-16 · Conversation State (backend-driven status)

- **Purpose:** Track whether a conversation is AI-handled, awaiting a human, resolved, or escalated.
- **Status:** **Backend only**
- **Backend:** `GET/PATCH /api/v1/chat/conversations/{client_id}/status`
- **Frontend:** `/messages` **infers** status client-side from `ai_response` presence and message age (`inferStatus()`); the "Take over" and "Approve" buttons have no `onClick` handler.
- **Tables:** `conversation_states`
- **Expected:** State is read from and written to the backend; the UI reflects the real stored value.
- **Actual:** The backend is complete and correct — including a WebSocket `conversation.state_changed` broadcast on write. The frontend does not call either endpoint; it re-derives a status heuristically and its takeover controls are inert.
- **Test cases:** E9 (404 before any state), E10 (PATCH → resolved), E11 (GET reflects it), E12 (invalid enum → 422), E14 (status filter) **PASS**.
- **Multi-tenant cases:** E13 **PASS**.
- **Result: PASS (backend) / NOT WIRED (frontend)** — 6/6 backend tests pass; **`GAP-02`, P2.**

---

### F-17 · Real-time WebSocket

- **Purpose:** Push new messages and status changes to open dashboards without polling.
- **Status:** Working
- **Backend:** `WS /api/v1/chat/ws?token=…`, `app/websockets/manager.py`
- **Frontend:** `hooks/useWebSocket.ts` (5 retries, exponential backoff, 30 s ping); `/messages` consumes `conversation.message_completed`
- **Dependencies:** JWT auth, in-process connection manager
- **Expected:** Authenticates by token, answers `ping` with `pong`, accepts a `subscribe` message to scope events to specific conversations, rejects invalid/absent tokens, and closes a connection silent for 90 s.
- **Actual:** Matches. The `{event, timestamp, conversation_id, organization_id, payload}` envelope and the frontend's consumer agree.
- **Test cases:** E15 (ping/pong), E16 (subscribe accepted), E17 (invalid token rejected), E18 (no token rejected) **PASS**.
- **Security cases:** The token travels as a **query parameter**, so it lands in Cloud Run request logs and any intermediary access log. Known and still open. **`BUG-17`, P2.**
- **Edge cases:** The connection manager is **in-process**. With Cloud Run autoscaling past one instance, a broadcast only reaches sockets attached to the emitting instance. **`DEBT-07`, P2.**
- **Production verification:** Open `/messages`, send a WhatsApp message from a linked client, confirm the row appears without a refresh.
- **Result: PASS** (4/4)

---

### F-18 · Channel Activity Aggregate

- **Purpose:** Show per-client, per-channel volume and last activity.
- **Status:** **Backend only** *(frontend is Mock UI)*
- **Backend:** `GET /api/v1/channels`
- **Frontend:** `/channels` derives rows from `clientsAPI.list()` and `mockHealth`/`mockVolume`/`mockMinutesAgo`
- **Tables:** `chat_history`, `clients`
- **Expected:** One row per `(client, channel)` with a real `volume_today` and `last_activity`, aggregated from `chat_history`.
- **Actual:** The endpoint is correct and tenant-scoped. **The `/channels` page never calls it.** It instead synthesises rows from client contact fields — and fabricates an **"Email" channel**, which the backend deliberately never returns because no email conversation history is persisted.
- **Test cases:** F1 (one row per client+channel), F2 (only whatsapp/telegram, never email), F4 (401 unauthenticated) **PASS**.
- **Multi-tenant cases:** F3 **PASS**.
- **Result: PASS (backend) / MOCK UI (frontend)** — 4/4 backend tests pass; **`GAP-03`, P2.**

---

### F-19 · Dashboard Statistics

- **Purpose:** Aggregate counts, month-over-month deltas, and an activity feed.
- **Status:** **Partially Working**
- **Backend:** `GET /api/v1/dashboard/stats`
- **Frontend:** `/dashboard` (Executive Snapshot, Signal Feed, AI Infrastructure), `/analytics`
- **Tables:** `clients`, `projects`, `chat_history`
- **Expected:** Real counts, real deltas, 7-day message histogram, integration status, recent AI metadata — all scoped to the caller and **excluding soft-deleted records**.
- **Actual:** Everything is real and tenant-scoped, and `recent_ai_messages` correctly carries metadata only (no message bodies). One defect: **soft-deleted clients are still counted.** `_get_user_client_ids()` and the `total_clients` query omit `Client.deleted_at.is_(None)`, so the dashboard reported 2 clients where `GET /clients` returned 1 (`G2b`). Messages and projects belonging to deleted clients are likewise still aggregated. **`BUG-07`, P1.**
- **Test cases:** G1, G2, G3, G4, G5, G7 **PASS**; G2b **FAIL**.
- **Multi-tenant cases:** G6 **PASS** — a second tenant sees zeros.
- **Mobile cases:** Right column collapses under the main column below `xl`.
- **Production verification:** Delete a client on the live app and confirm `total_clients` does not decrease.
- **Result: PARTIAL** (6/7)

---

### F-20 · Dashboard "Morning Briefing" & "Today's Focus"

- **Purpose:** An AI-generated daily priority digest.
- **Status:** **Mock UI / Preview** — `BRIEFING_PRIORITIES`, `BRIEFING_BLOCKER`, `BRIEFING_SUGGESTIONS`, `FOCUS_TASKS` are module constants. The panel carries `<PreviewBadge label="Preview content"/>`. Checkbox and dismiss state is local and not persisted.
- **Backend:** none (no insights endpoint)
- **Result: NOT IMPLEMENTED (intentional — Preview)**

---

### F-21 · Analytics Page

- **Purpose:** Revenue, client, project, conversation, uptime, and automation trends.
- **Status:** **Partially Working**
- **Backend:** reuses `/dashboard/stats`, `/clients`, `/projects`
- **Frontend:** `/analytics`
- **Expected:** Real metrics where data exists; anything unbacked is marked.
- **Actual:** 3 of 6 hero tiles are real (Active Clients, Active Projects, AI Conversations). Revenue, Platform Uptime, and Automation Success are hardcoded and carry `<PreviewMark/>`. Top Clients by Revenue, Cost by Agent, and Biggest Health Changes are `<PreviewBadge/>` panels. A `<PreviewBanner>` heads the page.
- **Result: PARTIAL (real where data exists, honestly marked elsewhere)**

---

### F-22 · Admin AI Chat

- **Purpose:** Let the agency owner query project state in natural language, with tools.
- **Status:** Working *(one information-disclosure defect)*
- **Backend:** `POST /api/v1/ai/chat` (20/min)
- **Frontend:** `/chat` with a project-context selector
- **Tables:** `projects`, `clients`, `github_cache`
- **Dependencies:** `VoxlyAgent`, provider SDKs, `get_github_stats_cached`
- **Expected:** 200 with `{response, tools_used}`; selecting a project injects its context into the system prompt; a foreign project id yields an explicit access-denied note and **no project data**; provider failures return a safe generic message.
- **Actual:** All of that holds on Postgres. One defect: the context builder's `except` returns `f"[System Error]: Failed to load context data: {exc}"` and **injects the raw driver exception — including the full SQL statement and schema — into the LLM system prompt.** Reproduced on Postgres with `context="project:not-a-uuid"`, `"project:"`, and `"project:'; DROP TABLE users; --"`; each returned `psycopg2.errors.InvalidTextRepresentation` plus the `SELECT` text. The query itself is properly parameterised — this is disclosure, not injection — but any authenticated user can elicit it, and the model may echo it back. **`BUG-11`, P1.**
- **Test cases:** N2 (response + tools), N3 (project context injected), N5 (provider failure sanitised) **PASS**.
- **Security cases:** N1 (401 unauthenticated) **PASS**; N4 (cross-tenant project denied, no data leaked) **PASS**; the exception-leak probe **FAIL**.
- **Multi-tenant cases:** N4 **PASS** — the project lookup is constrained by `Project.client_id.in_(user_client_ids)`.
- **Lane note:** N3/N4 cannot be exercised on SQLite — `Project.id == <str>` raises `'str' object has no attribute 'hex'` there. Both pass on Postgres, the production engine.
- **Production verification:** Send `{"message":"hi","context":"project:xyz"}` and inspect the reply for SQL fragments.
- **Result: PASS with a P1 defect** (5/6)

---

### F-23 · Multi-Provider AI (Anthropic / OpenAI / Gemini)

- **Purpose:** Route generation through whichever provider is configured, platform key or BYOK.
- **Status:** Working
- **Backend:** `app/services/ai_providers/` (base, claude, gemini, openai), `ai_service`, `ai_agent`
- **Tables:** `user_ai_keys`
- **Expected:** Provider selection by priority with graceful fallback; tool schemas translated per provider.
- **Actual:** Covered by the repo's own `test_ai_providers.py`, `test_ai_agent.py`, `test_ai_integration.py`, `test_ai_chat.py` — **all pass on L2.**
- **Result: PASS** (repo suite)

---

### F-24 · AI Agents Page (fleet, reasoning traces, executions)

- **Purpose:** Operate a multi-agent fleet.
- **Status:** **Mock UI / Preview.** Header banner: *"Voxly runs a single AI chat agent today, not a multi-agent fleet."* "New agent" is disabled with an explanatory `title`. The agent roster, fleet health, cost trend, queue depth, reasoning traces, and execution timeline are module constants. "Test" links to the one real chat interface at `/chat`.
- **Backend:** none
- **Result: NOT IMPLEMENTED (intentional — Preview)**

---

### F-25 · Automations Page

- **Purpose:** Trigger/condition/action workflow engine with approval checkpoints.
- **Status:** **Mock UI / Preview.** Banner: *"No automation/workflow engine exists yet."* "New automation" disabled. All 7 automations, the run timeline, and the approval checkpoint are constants.
- **Backend:** none
- **Result: NOT IMPLEMENTED (intentional — Preview)**

---

### F-26 · WhatsApp Inbound Pipeline

- **Purpose:** A client texts WhatsApp; the AI replies with real project context.
- **Status:** Working
- **Backend:** `POST /api/v1/whatsapp/webhook` (Twilio signature verified), `services/messaging_core.py::process_incoming_message`
- **Frontend:** results surface in `/messages` via WebSocket
- **Tables:** `clients`, `chat_history`, `conversation_states`, `projects`, `milestones`, `github_cache`
- **Dependencies:** Twilio, AI provider, ngrok/public URL
- **Expected:** Unsigned or wrongly signed requests → 401; a valid request resolves the client by phone, builds project context, generates a reply, persists history, updates conversation state, and broadcasts over WebSocket.
- **Actual:** Signature enforcement works. The pipeline is exercised by the repo's `test_conversation_state.py`, `test_conversation_metadata.py`, `test_realtime.py`, `test_localization.py`, `test_transcription.py` — **all pass on L2.**
- **Test cases:** L4 (no signature → 401), L5 (bad signature → 401), L6 (GET probe 200) **PASS**.
- **Security cases:** PII redaction in logs (only "Media present: true/false") retained from the 2026-03-10 hardening.
- **Production verification:** Text the sandbox number from a linked client and confirm an AI reply.
- **Result: PASS** (3/3 + repo suite)

---

### F-27 · Telegram Inbound Pipeline

- **Purpose:** Same conversation pipeline over Telegram.
- **Status:** Working
- **Backend:** `POST /api/v1/telegram/webhook` (`X-Telegram-Bot-Api-Secret-Token`), `GET /webhook`
- **Frontend:** `telegram_chat_id` field on the client form
- **Tables:** `clients.telegram_chat_id`, `chat_history.channel`
- **Expected:** Wrong/missing secret token → 401; unconfigured bot → 503; `/start` returns linking instructions; an unknown chat id gets a friendly "not linked" reply.
- **Actual:** Matches.
- **Test cases:** L7 (401 without secret), L8 (GET probe) **PASS**.
- **Security cases:** Secret-token validation is skipped when `TELEGRAM_WEBHOOK_SECRET` is empty (documented dev-mode behaviour); the production `env.yaml` sets it.
- **Result: PASS** (2/2)

---

### F-28 · GitHub Webhook (CI/build events)

- **Purpose:** Notify the right client's owner when a workflow run finishes.
- **Status:** Working
- **Backend:** `POST /api/v1/github/webhook`
- **Tables:** `projects.github_repo`, `clients`
- **Dependencies:** `GITHUB_WEBHOOK_SECRET` (set in `env.yaml`)
- **Expected:** Missing or invalid `X-Hub-Signature-256` → 401; a valid HMAC is accepted; log fetching is restricted to an allowlist of GitHub hosts; the archive is capped at 50 MB.
- **Actual:** Matches — all three hardening measures from the 2026-03-10 audit verified present and effective.
- **Test cases:** L1 (no signature → 401), L2 (bad signature → 401), L3 (valid HMAC accepted) **PASS**.
- **Security cases:** SSRF host allowlist + zip-bomb cap intact; notification routes to the repo owner resolved via `Project.github_repo` (the multi-tenancy fix from 2026-03-10).
- **Result: PASS** (3/3 + repo `test_github_webhook.py` 5/5)

---

### F-29 · GitHub Sync & Project Stats

- **Purpose:** Keep commit/issue/PR counts and progress fresh on every project.
- **Status:** **Partially Working — scheduled sync is not deployed**
- **Backend:** `services/github_service.py`, `services/cache_service.py`, `tasks/github_sync.py`, `tasks/celery_app.py` (beat schedule `sync_all_github_repos`)
- **Frontend:** `github_stats` on `/projects` and conversation responses
- **Tables:** `github_cache`
- **Expected:** Celery beat refreshes every repo on a schedule; on-demand reads hit the cache.
- **Actual:** The task code and beat schedule exist and the on-demand cached path works (`C7` verified `github_stats` on the response; the repo's `test_github_context.py` and `test_cache_service.py` pass). But **`gcloud run services list` shows exactly one service, `voxly-backend`**, whose `CMD` starts uvicorn only. There is **no Celery worker and no beat process in production** — and `docker-compose.yml` defines none either. The scheduled sync never runs; stats only refresh when a request happens to warm the cache. **`GAP-04`, P2.**
- **Production verification:** `gcloud run services list --project=voxly-491010` → one service.
- **Result: PARTIAL** (on-demand path works; scheduled path not deployed)

---

### F-30 · Voice Note Transcription

- **Purpose:** Transcribe inbound WhatsApp voice notes before the AI pipeline.
- **Status:** **Planned** — `VOICE_TRANSCRIPTION_ENABLED` defaults `False` and is **not set in production `env.yaml`**. Flag-off is a documented byte-identical no-op.
- **Backend:** `services/transcription_service.py` (covered by `test_transcription.py`, passing)
- **Result: NOT IMPLEMENTED (intentional — Planned, flag-gated, off in production)**

---

### F-31 · Language Detection & Localization

- **Purpose:** Detect the client's language and localize fixed system strings.
- **Status:** **Planned** — `LANGUAGE_DETECTION_ENABLED` defaults `False`, not set in production.
- **Backend:** `services/localization.py` (covered by `test_localization.py`, passing)
- **Result: NOT IMPLEMENTED (intentional — Planned, flag-gated, off in production)**

---

### F-32 · Plan Catalogue & Subscription Read

- **Purpose:** Show available plans and the caller's current subscription.
- **Status:** Working
- **Backend:** `GET /api/v1/billing/plans` (public), `GET /api/v1/billing/subscription` (20/min)
- **Frontend:** `/settings/billing`, landing-page pricing
- **Tables:** `plans`, `subscriptions`
- **Expected:** Plans list publicly; subscription returns `null` when none exists rather than 404.
- **Actual:** Matches.
- **Test cases:** J1, J2 **PASS**.
- **Result: PASS** (2/2)

---

### F-33 · Usage Metering & Quota

- **Purpose:** Show consumption against plan limits and back quota enforcement.
- **Status:** **Partially Working**
- **Backend:** `GET /api/v1/billing/usage` (20/min), `utils/usage_tracker.py` (Redis)
- **Frontend:** `/settings/billing` usage tiles
- **Tables:** `clients`, `projects`, `api_keys`, `plans`, `subscriptions`; Redis counters
- **Expected:** Live counts against plan limits; graceful behaviour when Redis is unreachable; **soft-deleted records must not count against quota**.
- **Actual:** Structure and limits are correct, and Redis unavailability degrades gracefully (logged, counters read 0, no 500 — observed directly when Upstash was unreachable from the audit machine). But `clients_count` uses `db.query(Client).filter(Client.user_id == …).count()` with **no `deleted_at` filter** — it reported 2 where the client list returned 1 (`J4`). On the Free plan (5 clients) a user who creates and deletes clients can be quota-locked out of an allowance they are not using. **`BUG-07`, P1** (same root cause as F-19).
- **Test cases:** J3 **PASS**; J4 **FAIL**.
- **Result: PARTIAL** (1/2)

---

### F-34 · Checkout (Stripe / Razorpay) — **BROKEN**

- **Purpose:** Convert a free user to a paid plan. The platform's entire revenue path.
- **Status:** **Broken**
- **Backend:** `POST /api/v1/billing/checkout` (5/min)
- **Frontend:** `/settings/billing` → gateway picker → `window.location.href = checkout_url`
- **Tables:** `plans`, `subscriptions`
- **Dependencies:** `stripe`, `razorpay`, `STRIPE_SECRET_KEY`, `RAZORPAY_KEY_ID/SECRET`
- **Expected:** 200 with a `checkout_url`; unknown plan → 404; free plan → 400.
- **Actual:** **The endpoint raises `AttributeError: 'Request' object has no attribute 'plan_id'` on every single call and returns HTTP 500.**

  ```python
  # backend/app/api/v1/billing.py:83
  plan = db.query(Plan).filter(Plan.id == request.plan_id).first()
  #                                       ^^^^^^^ starlette Request, not the payload
  ```

  The handler signature binds the body to `payload: CheckoutSessionRequest` and the
  ASGI request to `request: Request`. Line 83 reads `plan_id` off the wrong object.
  Reproduced live on both gateways and on the not-found path. **`BUG-01`, P0.**

  Compounding it: production `env.yaml` contains **no `STRIPE_*` and no `RAZORPAY_*`
  keys at all**, so even with line 83 corrected, checkout would fail at the gateway
  call. **`BUG-02`, P0.**

  There is **no `tests/test_billing.py`** — this router has zero automated coverage,
  which is why a one-token defect on the revenue path survived to production.
- **Test cases:** J5 (Stripe) **FAIL 500**, J6 (Razorpay) **FAIL 500**, J5b (unknown plan → 404) **FAIL 500**; J7 (invalid gateway → 422) **PASS**, J8 (unauthenticated → 401) **PASS**.
- **Security cases:** J8 **PASS** — the route is at least authenticated.
- **Production verification:** Click "Upgrade" on `/settings/billing` in production → 500.
- **Result: FAIL** (2/5)

---

### F-35 · Billing Portal & Payment Webhooks

- **Purpose:** Self-serve subscription management; activate plans on payment.
- **Status:** **Backend only** — unreachable in production
- **Backend:** `POST /api/v1/billing/portal`, `POST /api/v1/billing/webhook/stripe`, `POST /api/v1/billing/webhook/razorpay`
- **Frontend:** "Billing portal" button, shown only when `payment_gateway === 'stripe'`
- **Tables:** `subscriptions`, `plans`, `users`
- **Expected:** Portal 400s without a Stripe subscription; both webhooks reject unsigned payloads; a valid `checkout.session.completed` activates the subscription and sets `users.subscription_tier`.
- **Actual:** All guard paths behave correctly. The success paths are unreachable in production because no gateway secrets are configured — the webhook signature check will reject every real callback. `_handle_stripe_checkout_completed` / `_handle_razorpay_payment_captured` correctly coerce metadata strings to `UUID` and resolve tenant context.
- **Test cases:** J9 (portal → 400), J10 (Stripe webhook unsigned → 400), J11 (Razorpay webhook unsigned → 400) **PASS**.
- **Result: PASS (guards) / BLOCKED IN PRODUCTION (no gateway secrets)** — 3/3

---

### F-36 · API Key Lifecycle

- **Purpose:** Let users mint keys for programmatic access.
- **Status:** **Partially Working**
- **Backend:** `POST/GET /api/v1/api-keys/`, `GET/PATCH/DELETE /api/v1/api-keys/{id}`, `POST /{id}/rotate`
- **Frontend:** `/settings/api-keys`
- **Tables:** `api_keys`, `usage_logs`
- **Expected:** Create returns the plaintext key exactly once with the configured prefix; the list never returns key material; rotate issues a new secret and retires the old; revoke disables it.
- **Actual:** The whole management surface works flawlessly.
- **Test cases:** H1, H2, H3, H4, H5, H7, H8, H9, H10, H11, H13 **PASS**.
- **Multi-tenant cases:** H6 **PASS**.
- **Result: PASS** (12/12) — but see F-37.

---

### F-37 · Programmatic API Access via API Key — **NOT IMPLEMENTED**

- **Purpose:** Authenticate API requests with a `vx_live_…` key instead of a JWT.
- **Status:** **Not Implemented** (backend written, never wired)
- **Backend:** `app/utils/api_key_auth.py` defines `get_user_from_api_key()` and `get_current_user_or_api_key()`
- **Frontend:** `/settings/api-keys` — *"Generate a key to start making programmatic requests to the Voxly API."*
- **Expected:** A freshly created, active key authenticates at least the core read endpoints.
- **Actual:** **It authenticates nothing.** A grep across `backend/app/` shows the only import from `api_key_auth` anywhere is `generate_api_key` (in `api_keys.py`). Neither dependency is attached to a single route; every endpoint uses JWT-only `get_current_user`. A brand-new active key sent as `X-API-Key` against `GET /api/v1/clients` returns **401 `{"detail":"Not authenticated"}`** (`H12`). Users can create, label, rotate, and revoke keys that do nothing — and the UI invites them to. **`BUG-05`, P0** (a shipped feature that cannot work, with copy promising it does).
- **Test cases:** H12 **FAIL**.
- **Result: NOT IMPLEMENTED (unintentional — advertised but unwired)**

---

### F-38 · BYOK AI Provider Keys

- **Purpose:** Let users supply their own provider keys and pay the provider directly.
- **Status:** Working
- **Backend:** `GET /api/v1/ai-keys/providers`, `GET/POST /api/v1/ai-keys/`, `DELETE /{id}`, `POST /{id}/validate`
- **Frontend:** `/settings/ai-defaults`
- **Tables:** `user_ai_keys`
- **Dependencies:** Fernet authenticated encryption (replaced the old XOR scheme), provider SDKs
- **Expected:** Keys stored encrypted at rest, returned masked, never echoed in plaintext; unknown provider rejected; validation reports live provider status.
- **Actual:** Matches. The stored `api_key_encrypted` column contains no plaintext substring of the submitted key (verified by direct DB inspection).
- **Test cases:** I1, I2, I3 (masked), I4 (unknown provider → 400/422), I6 (encrypted at rest), I8 (delete) **PASS**.
- **Multi-tenant cases:** I5, I7 **PASS**.
- **Security cases:** `POST /{id}/validate` calls an external provider and has **no rate limit** — 30 consecutive calls, no 429 (`S5`). **`BUG-16`, P2.**
- **Result: PASS** (8/8; one P2 throttle gap)

---

### F-39 · AI Defaults (model, tone, escalation, working hours)

- **Purpose:** Workspace-level defaults for new agent configurations.
- **Status:** **Mock UI** — the four controls at the top of `/settings/ai-defaults` are `useState`-only and not persisted. Source comment: *"no backend field for per-workspace AI defaults yet; these are local-only display/interaction, not persisted."* The BYOK section below them is real (F-38).
- **Backend:** none
- **Result: NOT IMPLEMENTED (intentional — Mock UI)**

---

### F-40 · Client Follow-up Notification

- **Purpose:** Send an agency-typed WhatsApp message to a client.
- **Status:** **Backend only**
- **Backend:** `POST /api/v1/notifications/send` (10/min)
- **Frontend:** `notificationsAPI.send()` is defined in `lib/api.ts` and **called from no page**
- **Tables:** `clients`
- **Expected:** Sends to an owned client; 404 for a foreign client; 401 unauthenticated.
- **Actual:** The endpoint works and actually dispatches to the WhatsApp transport.
- **Test cases:** K1 (200), K2 (dispatch observed) **PASS**.
- **Multi-tenant cases:** K3 **PASS**.
- **Security cases:** K4 **PASS**.
- **Result: PASS (backend) / NOT WIRED (frontend)** — 4/4; **`GAP-05`, P2.**

---

### F-41 · Notification Preferences

- **Purpose:** Control email digest, Slack, desktop push, weekly summary.
- **Status:** **Mock UI** — all four toggles are `useState`-only. Source comment: *"No notification-preferences endpoint exists yet — these controls are local-only (not persisted)."*
- **Backend:** none
- **Result: NOT IMPLEMENTED (intentional — Mock UI)**

---

### F-42 · Organization Data Layer (dual-write + shadow-read)

- **Purpose:** Migrate from user-scoped to organization-scoped tenancy without downtime.
- **Status:** Working (backend, deliberately invisible)
- **Backend:** `utils/tenant_context.py`, `utils/tenant_metrics.py`, `scripts/backfill_organizations.py`; shadow-read wired into 5 list endpoints
- **Tables:** `organizations`, `memberships`, `roles`, `invitations`; `org_id` on `clients`, `projects`, `api_keys`, `user_ai_keys`, `subscriptions`, `usage_logs`
- **Dependencies:** `DUAL_WRITE_ORGANIZATIONS_ENABLED` and `DUAL_READ_SHADOW_VERIFY_ENABLED` — **both `true` in production**
- **Expected:** With the flag on, registration creates a personal org + owner membership and new rows carry `org_id`; with it off, resolution performs zero DB queries; shadow reads never alter a response.
- **Actual:** Matches. Covered by the repo's `test_tenant_context.py`, `test_tenant_context_integration.py`, `test_organizations.py`, `test_organization_backfill.py`, `test_shadow_read_verification.py` — **all pass on L2.**
- **Test cases:** Q1 (org auto-created), Q3 (`org_id` stamped on new clients) **PASS**.
- **Technical debt:** `get_or_create_personal_org`'s docstring still says *"there's no unique constraint on organizations.owner_user_id today"* — migration `5b8e3c1f9a2d` added it. **`DEBT-05`, P3.** Alembic `compare_metadata` also reports the model missing `unique=True` on `owner_user_id` (and on `invitations.token`, `organizations.slug`) where the migration declares it — cosmetic drift, but it means the SQLite test lane runs without those constraints. **`DEBT-06`, P2.**
- **Result: PASS** (repo suite + 2/2)

---

### F-43 · Organization Settings Page

- **Purpose:** Show workspace identity, plan, statistics, and connected services.
- **Status:** **Partially Working** — owner identity, plan tier, creation date, client count, and project count are real; "1 member", "Security & Compliance", and "Recent Activity" are static. Source comment states the app "has no multi-tenant Organization model yet (single account per user)" — which is now **stale**: the organization model exists and is dual-writing in production; it simply has no REST surface.
- **Backend:** `clientsAPI`, `projectsAPI`, `authAPI.me` only
- **Result: PARTIAL (Mock UI where no API exists)**

---

### F-44 · Team Members & Invitations — **NOT IMPLEMENTED**

- **Purpose:** Invite teammates, assign roles, suspend members.
- **Status:** **Preview** (correctly labelled)
- **Backend:** `memberships` and `invitations` tables + models exist and are tested; **no REST endpoints** (verified: `Q2` — zero matching routes in the OpenAPI schema)
- **Frontend:** `/settings/team-members` — `PreviewBanner`: *"This account has no team/membership backend yet. Only you (Owner, above) are real — every other row is illustrative."* "Invite member" disabled with `title="Invites require a team backend"`. Six named placeholder teammates, all `@example.com`.
- **Result: NOT IMPLEMENTED (intentional — Preview)**

---

### F-45 · Roles & Permissions — **NOT IMPLEMENTED**

- **Purpose:** Configure a role/permission policy.
- **Status:** **Preview** (correctly labelled)
- **Backend:** `roles` table with 5 seeded system roles; permissions are **resolved** into `TenantContext` but **enforced nowhere**
- **Frontend:** `/settings/roles` — `PreviewBanner`: *"The roles and matrix below illustrate the intended default policy, not a configured, enforced system."* "New role" disabled.
- **Result: NOT IMPLEMENTED (intentional — Preview)**

---

### F-46 · Workspace Security Policy (SSO, 2FA, IP allowlist)

- **Purpose:** Enterprise access controls.
- **Status:** **Coming Soon** — every row on `/settings/security` is a `disabled` toggle or a "Not available" chip with explicit copy ("Not available yet — this account has no 2FA/TOTP support"). The real, working password-change form sits below them.
- **Backend:** none for these rows
- **Result: NOT IMPLEMENTED (intentional — Coming Soon)**

---

### F-47 · General Settings (profile & locale)

- **Purpose:** Workspace name, full name, email, locale defaults.
- **Status:** **Partially Working** — workspace name and full name persist via `PUT /auth/profile`; email is read-only by design. Timezone, date format, and language are display-only (source: *"Locale preferences below have no backend field yet — display-only"*).
- **Test cases:** A13 **PASS**.
- **Result: PARTIAL (real fields work; locale rows are Mock UI)**

---

### F-48 · Super Admin Console

- **Purpose:** Platform-owner tenant oversight and support tooling.
- **Status:** Working
- **Backend:** `GET /voxly-admin/tenants`, `/tenants/{id}`, `/stats`, `/activity`; `PATCH /users/{id}/plan`, `/users/{id}/disable`; `POST /impersonate/{id}`
- **Frontend:** `/voxly-admin` (isolated `adminApi` axios instance with no 401 redirect interceptor)
- **Tables:** all
- **Dependencies:** `SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_SECRET` (both set in production)
- **Expected:** Dual-factor gate — must be authenticated **as** `SUPER_ADMIN_EMAIL` **and** present a matching `X-Admin-Secret`; unconfigured instance → 503; routes hidden from the public schema; impersonation mints a 15-minute token and refuses self-impersonation.
- **Actual:** Every gate holds.
- **Test cases:** M6 (hidden from OpenAPI) **PASS**.
- **Security cases:** M1 (unauthenticated → 401), M2 (valid JWT, no secret → 403), M3 (wrong secret → 403), M4 (correct secret, wrong email → 403), M5 (impersonation blocked for non-admin) **PASS**.
- **Multi-tenant cases:** Deliberately cross-tenant; access is the control.
- **Production verification:** `GET /voxly-admin/stats` unauthenticated on the live URL → **401 confirmed**.
- **Result: PASS** (6/6 + repo `test_super_admin.py`)

---

### F-49 · Platform Health & Security Headers

- **Purpose:** Liveness and baseline browser hardening.
- **Status:** **Partially Working**
- **Backend:** `GET /health`, `GET /`, `security_headers_middleware`
- **Expected:** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`, `Permissions-Policy` on every response; **`Strict-Transport-Security` on HTTPS**; Swagger/ReDoc hidden when `DEBUG=false`.
- **Actual:** Live probe of `https://voxly-backend-703348211297.us-central1.run.app/health` returns 200 in 0.44 s with all five baseline headers, and `/docs` correctly 404s. **`Strict-Transport-Security` is absent.** The middleware gates it on `request.url.scheme == "https"`, but behind Cloud Run's TLS-terminating proxy the app sees `http` and no `ProxyHeadersMiddleware` / `forwarded-allow-ips` handling corrects it. **HSTS is therefore never emitted in production.** **`BUG-12`, P1.**
- **Test cases:** O1, O2, O3.* (5 headers), O9 (OpenAPI generates) **PASS**; O4 documents the scheme-gated behaviour; the live probe confirms the production gap.
- **Result: PARTIAL** (9/10)

---

### F-50 · CORS Lockdown

- **Purpose:** Prevent arbitrary origins from calling the API with credentials.
- **Status:** Working
- **Backend:** `CORSMiddleware` restricted to `FRONTEND_URL` + localhost dev origins
- **Expected:** The configured origin is echoed; any other origin gets no `Access-Control-Allow-Origin`.
- **Actual:** Live probe — `Origin: https://voxly-oss.vercel.app` → `access-control-allow-origin: https://voxly-oss.vercel.app`; `Origin: https://evil.example.com` → **no** `access-control-allow-origin` header. Correct.
- **Result: PASS**

---

### F-51 · Rate Limiting

- **Purpose:** Throttle brute force, spam, and cost-bearing endpoints.
- **Status:** **Partially Working**
- **Backend:** `app/rate_limit.py` (slowapi), applied per route
- **Covered:** register 5/min, login 10/min, password-reset **request** 3/min, admin AI chat 20/min, notifications 10/min, billing checkout 5/min, billing portal 5/min, subscription 20/min, usage 20/min, data export 5/min, account delete 2/min.
- **Uncovered (verified):** `POST /auth/refresh` (`S4`), `POST /auth/password-reset/confirm` (`S3`), `POST /auth/github/callback` (`S6`), `POST /ai-keys/{id}/validate` (`S5`) — all four accepted 25–40 consecutive requests with no 429.
- **Test cases:** O8 (login brute force → 429) **PASS**; S3, S4, S5, S6 **FAIL**.
- **Edge cases:** slowapi's default limiter is **in-process**. With Cloud Run scaling past one instance, each instance keeps its own counters, so the effective limit multiplies by the instance count. The Upstash Redis already provisioned is not used as the limiter backend. **`DEBT-08`, P2.**
- **Result: PARTIAL** (1/5 probes; 11 endpoints covered, 4 gaps)

---

### F-52 · Input Validation & Pagination Bounds

- **Purpose:** Reject malformed input with a 4xx instead of crashing.
- **Status:** **Partially Working**
- **Backend:** Pydantic schemas across all routers
- **Expected:** Every list endpoint clamps `skip`/`limit`; over-length strings are rejected at the schema layer.
- **Actual:** `/api/v1/chat/messages` and `/chat/history/{id}` clamp correctly (`skip = max(skip, 0)`, `limit = min(limit, 100|200)`). **`/clients`, `/projects`, and `/milestones` do not** — they pass raw `skip`/`limit` into `.offset()/.limit()`. On Postgres, `?skip=-5&limit=-1` produces an unhandled `psycopg2.errors.InvalidRowCountInResultOffsetClause: OFFSET must not be negative` → **HTTP 500 on all three** (`O5a`, `O5b`, `O5c`). There is also **no upper bound** on `limit` (`O5d`: `limit=10000000` returns 200), so one request can force a full-table scan and serialization.

  *This defect is invisible on SQLite, which silently tolerates a negative OFFSET — it only appears on the production engine.*
- **Test cases:** O5a, O5b, O5c, O5d **FAIL**; B5b (over-length name → 500) **FAIL**; O6 (SQL-injection-shaped search parameterised, returns 0, no 500) **PASS**; O7 (XSS-shaped input stored verbatim and JSON-escaped) **PASS**; B12 (malformed UUID → 422) **PASS**.
- **Security cases:** O6, O7 **PASS** — no injection, no server-side execution.
- **Result: PARTIAL** (3/8) — **`BUG-03`, P0** (negative pagination 500) and **`BUG-15`, P1** (no limit ceiling)

---

### F-53 · JWT Token Type Separation

- **Purpose:** Prevent a token minted for one purpose being used for another.
- **Status:** **Partially Working**
- **Backend:** `utils/auth.py` — `create_access_token`, `create_reset_token`, `decode_access_token`, `verify_reset_token`
- **Expected:** A password-reset token presented as a `Bearer` credential is rejected with a clean 401.
- **Actual:** `decode_access_token` does verify `iss` and `aud` (closing part of the earlier audit's MED-10), but it does **not check a `scope`/type claim**. Reset tokens share the same `iss`/`aud` and the same signing key, so they pass structural validation; the only thing stopping them is that a reset token's `sub` is an **email**, and `UUID(user_id)` then raises an **uncaught `ValueError: badly formed hexadecimal UUID string` → HTTP 500** instead of a 401 (`S7`).

  There is no authentication bypass today — an email is never a valid UUID. But the separation is **accidental rather than enforced**, and the failure mode is a 500. `verify_reset_token` does check `scope == "password_reset"`; `decode_access_token` has no matching check in the other direction.
- **Test cases:** S7 **FAIL**.
- **Security cases:** **`BUG-10`, P1** — add a `scope`/`type` claim check and wrap the UUID parse.
- **Result: PARTIAL** (0/1)

---

### F-54 · Marketing Site, Docs & Interactive Demo

- **Purpose:** Explain and sell the product.
- **Status:** Working *(demo is intentionally simulated)*
- **Frontend:** `/` (hero, features, how-it-works, pricing, testimonials, social proof), `/docs`, `/not-found`
- **Expected:** Renders, builds statically, no dead internal links.
- **Actual:** All render and prerender. `InteractiveDemo` is a scripted simulation (uses `crypto.getRandomValues`, not `Math.random`, per the 2026-03-23 hotspot fix). Testimonials and social proof are illustrative marketing content.
- **Test cases:** Playwright `smoke.spec.ts` — home title, hero `h1`, `/login` reachable, `/register` reachable, unauthenticated `/dashboard` redirect **PASS**.
- **Note:** The pricing section invites an upgrade that lands on a checkout flow which currently 500s (F-34).
- **Result: PASS**

---

### F-55 · Frontend Build, Type, and Lint Integrity

- **Purpose:** Ship a frontend that compiles and type-checks.
- **Status:** Working
- **Expected:** Clean `tsc --noEmit`, clean `next build`, no lint errors.
- **Actual:**
  - `tsc --noEmit` → **exit 0, zero errors.**
  - `next build` → **exit 0**, 32 routes, 30 prerendered static + 2 dynamic.
  - `eslint .` → **0 errors, 66 warnings** (unused imports, `no-explicit-any`). Non-blocking debt. **`DEBT-09`, P3.**
- **Result: PASS**

---

### F-56 · Frontend E2E Suite — **STALE**

- **Purpose:** Guard rendered-UI behaviour against regression.
- **Status:** **Broken (test asset, not product)**
- **Frontend:** `tests/smoke.spec.ts`, `auth.spec.ts`, `dashboard.spec.ts`, `settings.spec.ts`
- **Expected:** The suite passes against the shipped UI.
- **Actual:** **22 passed, 24 failed** on chromium. Every failure is an assertion against the **pre-V3 UI** that commit `3d8ad0a` ("frontend v3 redesign (AI Work OS)") replaced — e.g. `settings.spec.ts` expects "settings page with all 4 tabs", but Settings is now 9 separate routes under a shared shell. The suite was never updated with the redesign.

  I verified separately that the routes themselves are healthy: against a production build, `/settings` → 200 (redirecting to `/settings/general`) and `/settings/general` → 200. **The product is fine; the tests are stale.** **`DEBT-03`, P2** — a stale E2E suite provides no regression protection and trains the team to ignore red.
- **Result: FAIL (test asset)** — 22/46

---

### F-57 · Backend Test Suite Integrity

- **Purpose:** Regression protection for the API.
- **Status:** **Partially Working**
- **Backend:** 28 test modules, 244 tests
- **Actual:**
  - **L2 (Postgres, CI-equivalent): 244 passed, 0 failed** in 5 m 22 s.
  - **L1 (default local SQLite): 242 passed, 2 failed** — both in `test_account_deletion.py`, because SQLite does not enforce foreign keys unless `PRAGMA foreign_keys=ON` is set, so `ON DELETE CASCADE` never fires and orphan `projects` rows survive. Re-run with the pragma enabled: **7/7 pass**. The file's own docstring asserts these tests "will pass identically" on the SQLite fallback — that claim is wrong. `conftest.py` should set the pragma. **`DEBT-01`, P2.**
  - **The suite makes live outbound Twilio calls using production credentials.** Client and project creation fire real notification hooks that are not stubbed; the run logged `HTTP 429 … Account AC646188… exceeded the 50 daily messages limit`. Every full local run burns real Twilio quota, can page real phone numbers, and makes results dependent on an external rate limit. **`DEBT-02`, P1.**
  - **Coverage gaps:** no `test_billing.py` (which is why `BUG-01` shipped), no dedicated tests for `api_keys` route auth, `whatsapp` route, `notifications`, `dashboard`, or `auth` OAuth flows. 1,548 `datetime.utcnow()` deprecation warnings.
- **Result: PARTIAL**

---

### F-58 · Deployment Configuration

- **Purpose:** Run the platform in production.
- **Status:** **Partially Working**
- **Infra:** Cloud Run `voxly-backend` (us-central1) · Vercel `voxly-oss.vercel.app` · Supabase Postgres (Mumbai) · Upstash Redis
- **Actual:**
  - Backend live: `GET /health` → **200 `{"status":"healthy"}`** in 0.44 s. Frontend live: **200**.
  - Unauthenticated `GET /api/v1/clients` → **401**; `GET /voxly-admin/stats` → **401**. Gates hold in production.
  - `/docs` → **404** (correctly hidden with `DEBUG=false`).
  - **Missing from `env.yaml`:** all `STRIPE_*`, all `RAZORPAY_*`, `RESEND_FROM_EMAIL`. See `BUG-02`, `BUG-06`.
  - **No Celery worker or beat process** is deployed — one Cloud Run service only. See `GAP-04`.
  - The container `CMD` is `alembic upgrade head || echo 'Migration skipped…'` — **a failed migration is swallowed and the server starts anyway**, so schema drift deploys silently. **`DEBT-04`, P2.**
  - `env.yaml` must be hand-synced with `.env` before each deploy — no automation, no drift check.
- **Result: PARTIAL**

---

## 4. Consolidated Execution Results

| Lane | Executed | Passed | Failed | Not Implemented |
|---|---:|---:|---:|---:|
| L1 — pytest (local SQLite) | 244 | 242 | 2 | — |
| L2 — pytest (Postgres, CI-equivalent) | 244 | **244** | **0** | — |
| L3 — Acceptance harness (Postgres) | 169 | 154 | 14 | 1 |
| L4 — Security probes (Postgres) | 9 | 2 | 7 | — |
| L5 — Frontend static (tsc/eslint/build) | 3 | 3 | 0 | — |
| L6 — Playwright E2E (chromium) | 46 | 22 | 24 | — |
| L7 — Production probes | 9 | 8 | 1 | — |
| **Total (L2 + L3–L7)** | **480** | **433** | **46** | **1** |

### 4.1 All failing acceptance checks

| ID | Check | Result | Defect |
|---|---|---|---|
| J5 | `POST /billing/checkout` → Stripe | 500 `AttributeError` | `BUG-01` P0 |
| J6 | `POST /billing/checkout` → Razorpay | 500 `AttributeError` | `BUG-01` P0 |
| J5b | Checkout, nonexistent plan → 404 | 500 `AttributeError` | `BUG-01` P0 |
| O5a | Negative pagination `/clients` | 500 `DataError` | `BUG-03` P0 |
| O5b | Negative pagination `/projects` | 500 `DataError` | `BUG-03` P0 |
| O5c | Negative pagination `/milestones` | 500 `DataError` | `BUG-03` P0 |
| B4 | Same phone in a different tenant | 409 | `BUG-04` P0 |
| H12 | Active API key authenticates | 401 | `BUG-05` P0 |
| B4b | Phone conflict message accuracy | wrong text | `BUG-14` P1 |
| B5 | Invalid phone rejected | 201 accepted | `BUG-13a` P1 |
| B5b | Over-length name rejected | 500 `DataError` | `BUG-13` P1 |
| G2b | Dashboard excludes soft-deleted | counts them | `BUG-07` P1 |
| J4 | Usage excludes soft-deleted | counts them | `BUG-07` P1 |
| O5d | `limit` upper bound | unbounded | `BUG-15` P1 |
| S1 | Old JWT revoked on password change | still valid | `BUG-08` P1 |
| S2 | Reset token single-use | replayable | `BUG-09` P1 |
| S7 | Reset token as Bearer → 401 | 500 `ValueError` | `BUG-10` P1 |
| S3 | Reset-confirm throttled | no 429 | `BUG-16` P2 |
| S4 | Refresh throttled | no 429 | `BUG-16` P2 |
| S5 | AI-key validate throttled | no 429 | `BUG-16` P2 |
| S6 | OAuth callback throttled | no 429 | `BUG-16` P2 |
| Q2 | Organization/team REST API | absent | Preview (intentional) |
| L7-HSTS | HSTS in production | absent | `BUG-12` P1 |

---

## 5. Regression Suite Recommendations

Add before v1.0.0:

1. **`tests/test_billing.py`** — checkout happy path (mocked gateways), unknown plan → 404, free plan → 400, both webhook signature paths. *This one file would have caught `BUG-01`.*
2. **`tests/test_pagination.py`** — parametrised `skip=-1`, `limit=-1`, `limit=10**7` across `/clients`, `/projects`, `/milestones`, `/chat/messages`.
3. **`tests/test_api_key_auth.py`** — an active key authenticates a real route; a revoked key does not.
4. **`tests/test_session_security.py`** — token revocation on password change; reset-token single-use; reset token rejected as Bearer.
5. **`tests/test_soft_delete_accounting.py`** — dashboard and usage counts drop after a soft delete.
6. **`conftest.py`**: enable `PRAGMA foreign_keys=ON` for SQLite, and autouse-stub `whatsapp_service.send_whatsapp_message`.
7. **Rewrite `frontend/tests/{dashboard,settings}.spec.ts`** against the V3 IA.
8. **Multi-tenant phone test** — two tenants, one phone number, expect 201 for both.

---

*Executed 2026-07-27 against `develop` @ `1907890`. No source file was modified. The audit Postgres container was removed on completion; `git status` shows the working tree unchanged.*
