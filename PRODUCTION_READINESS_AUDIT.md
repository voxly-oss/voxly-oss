# Production Readiness Audit

**Date:** 2026-07-26
**Scope:** Full end-to-end audit of production (frontend + backend), post frontend-v3-deploy. Read-only — no code changes made.
**Method:** Git/GitHub API verification, live production API/WebSocket testing against a real throwaway account, Cloud Run log inspection, and static code review (direct + 3 parallel research passes over backend code).

---

## 1. Deployment sync verification (your claims, checked)

| Claim | Verified | Evidence |
|---|---|---|
| Backend on latest Cloud Run revision | ✅ True | `voxly-backend-00017-llb`, 100% traffic, `/health` → `{"status":"healthy"}`. No new revision was needed — no backend application code changed since that revision (only a test file). |
| Production migrations applied | ✅ True | `alembic current` against production DB → `d29b6f814c3e (head)`. |
| Frontend v3 deployed to Vercel | ✅ True | `https://voxly-oss.vercel.app/login` now serves the fixed text ("TLS encrypted · Bring your own AI keys"), `Age: 0` (fresh, not cached). New routes `/agents`, `/channels` return `200`. This reverses my last check, where the same page showed the old fabricated "SOC 2 compliant" text with `Age: 876262` (~10 days stale). |
| PR #106 merged into main | ✅ True | `gh pr view 106` → `MERGED`, merge commit `7599628`. |
| Backend/frontend synchronized | ✅ True | CORS preflight from `https://voxly-oss.vercel.app` against the backend succeeds; the new Phase 3 endpoints (`/api/v1/chat/conversations`, `/api/v1/channels`) are live and correctly return `401` unauthenticated. |

**Conclusion:** the deployment is real and correct. Proceeding to the full audit below.

---

## 2. Live E2E test performed

Registered a throwaway account (`audit-e2e-1785064129@example.com`, id `d04a6e28-249e-4297-ab43-e75dfcbd3a3f`) directly against production and exercised: register → login → `/auth/me` → `/dashboard/stats` → `/clients` → `/chat/conversations` → `/channels` → WebSocket connect + `subscribe` message → WebSocket reject-invalid-token. All passed. Full CRUD (creating real clients/projects) was **not** exercised, to avoid generating more orphaned test data — see §3, P0-1, which is exactly why: **account cleanup failed**, and that failure is itself the top finding.

**⚠️ Residual test data:** `audit-e2e-1785064129@example.com` / `d04a6e28-249e-4297-ab43-e75dfcbd3a3f` could not be deleted (see P0-1) and remains in production. It has zero clients/projects/messages attached. Needs manual cleanup once P0-1 is fixed, or a one-off DB delete if you want it gone sooner — I did not perform a direct database mutation outside the API, since that's a destructive production action I didn't have standing approval for for this audit.

---

## 3. Classified findings

### P0 — Production blocker

**P0-1. Account deletion is completely broken — every `DELETE /api/v1/auth/me` call fails with a 500.**
- **Reproduced live:** deleting the audit test account returned `500 Internal Server Error`; `GET /auth/me` afterward confirmed the account still exists.
- **Root cause:** Production has `DUAL_WRITE_ORGANIZATIONS_ENABLED=true` (confirmed by this reproduction — the code's own default is `False`, and `resolve_tenant_context()` is a genuine no-op when the flag is off, `tenant_context.py:156-157`; something in the live environment overrides this). With the flag on, every registration auto-creates an `Organization` row with `owner_user_id` pointing at the new user (`tenant_context.py:161-165`). That FK is `ondelete='RESTRICT'` by explicit design (`alembic/versions/c1f7825d5a5d_add_organizations_roles_memberships.py:90-91`). `delete_user_account` does a bare `db.delete(current_user); db.commit()` (`app/api/v1/auth.py:707-709`) with no handling for organizations the user owns, so Postgres rejects the delete with `ForeignKeyViolation: organizations_owner_user_id_fkey`, which the endpoint catches and turns into a generic 500 (no stack trace leaked — that part is fine).
- **Files:** `backend/app/api/v1/auth.py:699-719`; `backend/app/utils/tenant_context.py:140-178`; `backend/alembic/versions/c1f7825d5a5d_add_organizations_roles_memberships.py:90-91`.
- **Risk:** GDPR "right to erasure" is non-functional for every current and future user. The frontend Danger Zone page (reviewed and shipped earlier this session) promises "Permanently deletes all data. Cannot be undone" behind a real, correctly-gated `DELETE`/confirm flow — but the backend silently fails every time. This is a compliance and trust issue, not just a bug.
- **Recommended fix:** In the same transaction, either (a) delete/cascade organizations the user solely owns before deleting the user, or (b) if the org has other members, require ownership transfer first and return a clear `409` instead of a generic `500`. Needs a one-line product decision (which behavior), then a small, well-tested change.
- **Effort:** S (2–4h, plus a Postgres-backed test since this is exactly the kind of FK behavior SQLite won't catch — see the CI failure fixed earlier today for a live example of that exact gap).

---

### P1 — Important

**P1-1. Frontend doesn't consume the Phase 3 / Channels backend endpoints it was built to use.**
- `/chat/conversations`, `GET`/`PATCH /chat/conversations/{id}/status`, and `/channels` are live, tested, and correctly auth-guarded in production — confirmed in this audit — but `frontend/lib/api.ts` has zero client functions for any of them.
- Conversation Center (`frontend/app/messages/page.tsx`) still calls the old flat `/chat/messages` and computes status client-side via `inferStatus()` (a 15-minute-age heuristic) instead of the real, persisted `ConversationState`. Confidence/sentiment shown are a hash of the message ID, not the real (possibly-null) `ChatHistory.confidence`/`.sentiment` columns.
- Channels page (`frontend/app/channels/page.tsx`) fabricates health/volume/last-activity per row via a hash function, including a fake "Email" row — a channel type the real endpoint deliberately excludes (no persisted conversation history to aggregate for email).
- **Files:** `frontend/lib/api.ts`, `frontend/app/messages/page.tsx`, `frontend/app/channels/page.tsx`.
- **Risk:** five completed backend milestones sit unused; real dogfooding users see fake status/confidence/health values (now visually flagged with Preview badges as of this session, but still not real).
- **Effort:** M (1–2 days) — add the missing API client functions, replace `inferStatus()`/hash-based mocks with real data, wire the status PATCH to the "Take over"/"Approve" buttons (currently no-ops).

**P1-2. No inbound message throttling on WhatsApp/Telegram.**
- `messaging_core.process_incoming_message` (`backend/app/services/messaging_core.py:297-378`) has no length cap or per-client rate limit before invoking the AI pipeline. A single client can drive unbounded AI API cost by spamming messages.
- **Files:** `backend/app/services/messaging_core.py`, `whatsapp.py`, `telegram.py`.
- **Risk:** direct dollar-cost exposure; potential AI-provider quota exhaustion affecting all tenants.
- **Effort:** S–M — a per-client sliding-window counter backed by the existing `cache_service.py` (which already has Redis + in-memory fallback wired).

**P1-3. Telegram webhook fails open if its secret is unset.**
- `telegram.py:26-29` skips secret-token validation entirely whenever `TELEGRAM_WEBHOOK_SECRET` is empty — **regardless of DEBUG/production mode.** GitHub's equivalent check is fail-closed outside DEBUG; Telegram's isn't.
- **Risk:** if that env var is ever unset in production, anyone can POST a fake Telegram update and trigger the AI pipeline as any "client."
- **Effort:** S — mirror the GitHub webhook's fail-closed pattern.

**P1-4. HSTS header is not actually reaching clients in production.**
- Confirmed live: `curl -sD - https://voxly-backend-.../health` shows no `Strict-Transport-Security` header, despite `main.py:64-65` intending to set it when `request.url.scheme == "https"`. Cloud Run terminates TLS at its own edge and forwards internally over HTTP; Uvicorn isn't configured to trust `X-Forwarded-Proto`, so that condition never evaluates true.
- **Effort:** S — either set HSTS unconditionally (the service is HTTPS-only externally regardless of internal scheme) or configure proxy-header trust.

**P1-5. Several sensitive endpoints have no rate limiting.**
`/auth/refresh` (mints a fresh token from a valid one), `/auth/google`, `/auth/github`, `/auth/github/callback`, `/auth/password-reset/confirm`, all of `api_keys.py` (create/rotate/revoke), and `ai_keys.py`'s `add`/`delete`/`validate` (validate triggers a live outbound call to the AI provider per hit) have no `@limiter.limit`, unlike their sibling endpoints.
- **Effort:** S — mechanical application of the existing decorator pattern.

**P1-6. Password-reset token is reusable within its 15-minute window, and silent email failure.**
No `jti`/single-use tracking — the same reset JWT works repeatedly until it expires. Separately, if `RESEND_API_KEY` is unset, `email_service.py` silently no-ops (warning log only) while the API still returns 200 "reset email sent" — a real user would think a reset was sent when nothing was delivered, with no operator alert.
- **Effort:** S each.

**P1-7. Missing indexes on hot query columns.**
`chat_history.created_at` (used in `ORDER BY`, range filters, and `MAX()`/`GROUP BY` across `chat.py` and `channels.py`) and `conversation_states.status` (filtered directly in the conversations-list join) have no index. Harmless today at dogfooding volume; will degrade as real usage grows.
- **Effort:** S — one additive migration.

---

### P2 — Nice to have

- **P2-1.** Organizations/Roles/Memberships/Invitations exist at the DB layer with **zero API surface** (no router registered anywhere) — confirmed the "Organization," "Team Members," and "Roles & Permissions" settings pages are correctly illustrative-only, matching this session's earlier Preview-badge work. Worth a deliberate decision (build it, or shelve it) rather than leaving it in limbo. Effort: L if built for real.
- **P2-2.** `DUAL_WRITE_ORGANIZATIONS_ENABLED=true` is live in production with no documented decision, no deployment-report mention, and no test coverage against Postgres exercising it — discovered only via this audit's live reproduction of P0-1. Recommend a "current production flags" checklist. Effort: S (process, not code).
- **P2-3.** No structured (JSON) logging anywhere in the backend; no request-correlation ID beyond Cloud Run's own trace header. Effort: M.
- **P2-4.** No global FastAPI exception handler — relies on the framework default. No leaks found in this audit, but a catch-all with a consistent error shape (and an error-tracking hook) would help operability. Effort: S–M.
- **P2-5.** GitHub sync (`github_sync.py`, hourly Celery task across all active repos) has no explicit GitHub API rate-limit/backoff handling, just a flat 5-minute retry on any failure. Effort: S.
- **P2-6.** SQLAlchemy connection pool uses library defaults (`pool_size=5`, `max_overflow=10`), unset explicitly. At up to 12 Cloud Run instances that's a theoretical ~180 connections against the Supabase pooler — worth confirming against the pooler's real ceiling. Effort: S.
- **P2-7.** WebSocket manager is pure in-process memory with no cross-instance pub/sub (documented in its own code comment) — a real gap only if Cloud Run scales beyond one live instance concurrently. Effort: L if/when needed.
- **P2-8.** `.env.example` ships `DEBUG=true` — a copy-paste footgun (confirmed **not** the actual production value, so no live exposure today). Effort: XS.
- **P2-9.** `INTERNAL_WEBHOOK_SECRET` is dead config — the endpoint it used to guard was refactored away; nothing references it now. Effort: XS — remove or repurpose.

---

## 4. Categories audited with no findings worth flagging

For completeness — these were checked, not skipped:
- **Dashboard, Clients, Projects (read paths):** verified live with real requests; all N+1-safe (batched queries/`selectinload` confirmed in `clients.py`, `projects.py`, `chat.py::list_conversations`, `channels.py`).
- **GitHub webhook security:** HMAC verification, host allowlist, and zip-bomb cap all confirmed intact.
- **WhatsApp security:** Twilio signature verification and PII log redaction both confirmed intact; no `str(e)` leaks to the Twilio caller.
- **CORS:** confirmed correctly scoped to the production frontend origin (not wildcard) via a live preflight request.
- **WebSocket auth:** confirmed live — valid token connects and accepts the new `subscribe` message; invalid token rejected with `403`.
- **Cache resilience:** Redis circuit breaker + bounded in-memory fallback confirmed present and correctly wired (`cache_service.py`).
- **Secrets handling:** `SECRET_KEY` has no default (fails closed at startup if unset); no hardcoded secrets found anywhere scanned.

---

## 5. Recommended next engineering milestone

**Resolve the multi-tenancy (Phase 1) state before building anything else on top of it.**

Not "wire the frontend to the new conversation endpoints" (P1-1) — even though that's the most visible waste of already-completed work. Here's the reasoning:

This audit discovered that **Phase 1 multi-tenancy is silently live in production** (`DUAL_WRITE_ORGANIZATIONS_ENABLED=true`), doing real work on every registration (creating `Organization`/`Membership` rows), with:
- No record of anyone deciding to turn it on (not in `CLAUDE.md`, not in any deployment report).
- No test coverage exercising it against Postgres (the same gap that let this morning's CI failure through).
- No API surface, no frontend usage, no RBAC enforcement anywhere — the org/role/membership layer is inert except for auto-creating rows nobody manages.
- One confirmed, reproducible **P0 production bug** as a direct, immediate consequence.

Every other item in this report — including the very reasonable P1-1 (frontend/backend wiring) — assumes a stable answer to "is a project/client scoped to a user or an org?" Building the conversation-status UI, adding RBAC-gated actions, or extending Settings > Organization from illustrative to real would all need to pick a side of that question. Right now the codebase has quietly picked "org" at the write layer while every read path still filters on `user_id` — a split-brain that's already broken account deletion once and will surface again anywhere else that assumes clean cascade/ownership semantics.

**Concretely:** one milestone, two decisions, then implementation:
1. Decide: commit to org-based tenancy (finish the read-path migration, wire real RBAC, give Team Members/Roles a real API) or roll it back (`DUAL_WRITE_ORGANIZATIONS_ENABLED=false`, treat the org tables as not-yet-launched).
2. Either way, fix P0-1 as part of the same milestone — the fix depends on which direction you pick.
3. Only after that: P1-1 (frontend integration) becomes the natural next milestone, since it'll be built against a tenant model that's actually settled.

This is a half-day-to-two-day decision-plus-fix milestone, not a big build — but it's the one piece of foundation everything else in this report sits on top of.

---

## 6. Summary

- 1 P0, 7 P1, 9 P2.
- Deployment itself is verified correct and complete — this audit's findings are pre-existing product/backend gaps surfaced by testing against the now-live production system, not deployment defects.
- No code was changed during this audit. Waiting for your approval before any fix work begins.
