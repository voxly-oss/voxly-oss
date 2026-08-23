# Voxly — Production Acceptance Report

**Version:** 1.0
**Date:** 2026-07-27
**Branch:** `develop` @ `1907890`
**Target release:** v1.0.0
**Companion document:** [TEST_PLAN.md](./TEST_PLAN.md) — full inventory, per-feature test cases, and raw results
**Method:** 480 executed checks across 7 lanes. No source file was modified.

---

## Verdict

**Do not ship v1.0.0 yet.** Six production blockers, five of them confirmed by
live execution against the production database engine.

The engineering underneath this platform is genuinely strong. Multi-tenant
isolation held on **every one of 24 cross-tenant probes**. Account deletion —
a transactional hard delete across 16 tables with `RESTRICT`-ordered FK
teardown — passed all 13 checks. The full backend suite is **244/244 green on
the CI-equivalent Postgres lane**. Webhook signature verification, SSRF host
allowlisting, zip-bomb caps, BYOK Fernet encryption, OAuth CSRF state binding,
and the dual-factor super-admin gate all verified working. The frontend
type-checks and builds clean across 32 routes. Where a feature is unfinished,
the UI says so out loud — `PreviewBanner`, disabled buttons with explanatory
`title` attributes, and honest source comments are used consistently and well.
That discipline is unusual and it made this audit fast.

The problem is narrower than the codebase's overall quality suggests, and it
clusters in one place: **the parts nobody wrote a test for.**

`POST /api/v1/billing/checkout` reads `plan_id` off the ASGI `Request` object
instead of the parsed request body. It has never worked. Every upgrade attempt —
Stripe or Razorpay — returns HTTP 500. There is no `tests/test_billing.py`.
That is the entire causal story: the revenue path is the only major router with
zero automated coverage, and it is the router that is broken.

The same pattern repeats. API keys can be created, labelled, rotated, and
revoked through a polished settings page that invites users to "start making
programmatic requests" — but `get_current_user_or_api_key` is attached to no
route in the codebase, so a freshly minted key returns 401 everywhere. Negative
pagination parameters crash three list endpoints with a 500 on Postgres while
passing silently on the SQLite lane developers actually run. `clients.phone`
carries a table-level `unique=True` that is global across every tenant, so the
second agency to onboard a given phone number is simply refused — and told,
incorrectly, that it's a Telegram Chat ID conflict.

None of these are architectural failures. They are a handful of specific,
individually small defects sitting on the highest-value paths, each one
reachable in an afternoon. The fix list below is short.

---

## 1. Overall Completion

Two figures, because they answer different questions.

| Measure | Score | What it means |
|---|---:|---|
| **Shipped-scope completion** | **71%** | Of the 46 features presented to users as available, weighted by working state |
| **Total-vision completion** | **59%** | Of all 58 features including the 12 deliberately shown as Preview / Coming Soon |

**Weighting:** Working = 1.0 · Partially Working = 0.5 · Backend-only = 0.4 ·
Broken / Not Implemented = 0 · intentionally-deferred = 0.15 (design and honest
UI shipped, no function).

| Status | Count | % of 58 |
|---|---:|---:|
| Working | 23 | 40% |
| Partially Working | 15 | 26% |
| Backend-complete / frontend-missing | 5 | 9% |
| Mock UI (intentional) | 6 | 10% |
| Coming Soon / Preview / Planned (intentional) | 6 | 10% |
| Broken / Not Implemented (unintentional) | 3 | 5% |

---

## 2. Features Working (23)

Fully verified end-to-end, no known defect.

| # | Feature | Evidence |
|---|---|---|
| F-01 | Email/password registration + auto org creation | 6/6 |
| F-02 | Email/password login (JWT, `iss`+`aud` verified) | 8/8 |
| F-04 | Change password | 3/3 |
| F-06 | Google OAuth sign-in | 1/1 automated (happy path needs manual prod check) |
| F-07 | GitHub OAuth + `httponly` CSRF state cookie | 3/3 |
| F-08 | GDPR data export (no secret material) | 3/3 |
| F-09 | Account deletion — transactional hard delete, 16 tables | 13/13 |
| F-13 | Project CRUD + GitHub repo linking + `github_stats` | 10/10 |
| F-14 | Milestone CRUD, soft delete, completion notification | 7/7 |
| F-17 | WebSocket realtime (auth, ping/pong, subscribe, backoff) | 4/4 |
| F-22 | Admin AI chat + project context injection | 5/6 — one P1 disclosure defect |
| F-23 | Multi-provider AI (Anthropic / OpenAI / Gemini) | repo suite |
| F-26 | WhatsApp inbound pipeline (Twilio signature verified) | 3/3 + repo suite |
| F-27 | Telegram inbound pipeline (secret token verified) | 2/2 |
| F-28 | GitHub webhook — HMAC, SSRF allowlist, 50 MB zip cap | 3/3 + 5/5 |
| F-32 | Plan catalogue & subscription read | 2/2 |
| F-36 | API key lifecycle (create / rotate / revoke / mask) | 12/12 |
| F-38 | BYOK AI keys — Fernet at rest, masked in transit | 8/8 |
| F-42 | Organization dual-write + shadow-read (live in prod) | repo suite + 2/2 |
| F-48 | Super admin console — dual-factor, schema-hidden | 6/6 |
| F-50 | CORS lockdown (verified against a hostile origin in prod) | live probe |
| F-54 | Marketing site, docs, interactive demo | Playwright smoke |
| F-55 | Frontend build + typecheck (32 routes, 0 TS errors) | exit 0 |

---

## 3. Features Partially Working (15)

| # | Feature | What works | What doesn't |
|---|---|---|---|
| F-03 | Session lifecycle | Refresh mints tokens | Password change doesn't revoke old tokens; refresh unthrottled |
| F-05 | Password reset | Resend wired; no email enumeration | Token replayable 15 min; confirm unthrottled; prod sender address unset |
| F-11 | Client CRUD | CRUD, scoping, soft delete | Global phone uniqueness; no phone validation; 500 on long name; wrong error text |
| F-19 | Dashboard statistics | Real counts, deltas, feed, tenant-scoped | Counts soft-deleted clients |
| F-21 | Analytics page | 3 of 6 tiles real | 3 tiles + 3 panels are Preview-marked mock |
| F-22 | Admin AI chat | Full flow + tool use + tenant isolation | Leaks raw SQL into the LLM system prompt on error |
| F-29 | GitHub sync | On-demand cached stats | Celery beat not deployed — scheduled sync never runs |
| F-33 | Usage metering & quota | Live counts, graceful Redis degradation | Counts soft-deleted clients against quota |
| F-43 | Organization settings page | Owner, plan, client/project counts real | Member count, compliance, activity static |
| F-47 | General settings | Name + workspace name persist | Timezone / date format / language display-only |
| F-49 | Health & security headers | 5 baseline headers, `/docs` hidden | HSTS never emitted in production |
| F-51 | Rate limiting | 11 endpoints covered | 4 gaps; in-process counters multiply across instances |
| F-52 | Input validation | Injection-safe, UUID-safe, chat clamps | 3 endpoints 500 on negative pagination; no `limit` ceiling |
| F-53 | JWT token separation | `iss`/`aud` verified | No `scope` check; reset-token-as-Bearer → 500 |
| F-57/58 | Test suite & deployment | 244/244 on Postgres; prod live and gated | See §12 |

---

## 4. Backend-Complete / Frontend-Missing (5)

Working, tested, tenant-scoped API surface that **no page consumes**. This is
finished work delivering zero user value — the cheapest ROI on the list.

| # | Endpoint | Tests | Frontend reality |
|---|---|---|---|
| F-15 | `GET /api/v1/chat/conversations` | 7/7 | Absent from `lib/api.ts`. `/messages` still groups client-side over one page of raw messages — the exact artefact this endpoint was built to remove. |
| F-16 | `GET`/`PATCH /chat/conversations/{id}/status` | 6/6 | `/messages` re-derives status heuristically via `inferStatus()`; "Take over" and "Approve" buttons have no `onClick`. |
| F-18 | `GET /api/v1/channels` | 4/4 | `/channels` synthesises rows from client contact fields via `mockVolume()` — and fabricates an "Email" channel the backend deliberately never returns. |
| F-35 | Billing portal + Stripe/Razorpay webhooks | 3/3 guards | Guard paths correct; unreachable in production (no gateway secrets). |
| F-40 | `POST /api/v1/notifications/send` | 4/4 | `notificationsAPI.send()` defined in `lib/api.ts`, called from no page. |

---

## 5. Frontend-Complete / Backend-Missing (0 unintentional)

No page promises a backend that was supposed to exist and doesn't. Every
frontend-only surface is explicitly labelled — see §6 and §7.

---

## 6. Mock Features (6 — intentional, correctly labelled)

Each carries a visible `PreviewBadge` / `PreviewMark` / `PreviewBanner` **and** a
source comment stating the backend does not exist.

| # | Feature | Label in UI |
|---|---|---|
| F-12 | Client health score & MRR | `PreviewBadge` on both panels |
| F-20 | Morning Briefing & Today's Focus | `PreviewBadge label="Preview content"` |
| F-24 | AI Agents fleet, traces, executions | Banner: *"Voxly runs a single AI chat agent today, not a multi-agent fleet."* |
| F-25 | Automations engine | Banner: *"No automation/workflow engine exists yet."* |
| F-39 | AI defaults (model / tone / escalation) | Local-only toggles above the real BYOK section |
| F-41 | Notification preferences | Local-only toggles |

**Assessment:** this is done right. The only correction needed is F-18 — the
Channels page fabricates an Email channel row *without* a per-row Preview mark,
while a real channels endpoint sits unused. Fix by wiring the real endpoint.

---

## 7. Coming Soon / Preview / Planned (6 — intentional)

| # | Feature | Signal |
|---|---|---|
| F-10 | Transfer ownership | Button disabled, `title="No other members exist yet"` |
| F-30 | Voice transcription | `VOICE_TRANSCRIPTION_ENABLED=False`, flag-off is a documented no-op |
| F-31 | Language localization | `LANGUAGE_DETECTION_ENABLED=False` |
| F-44 | Team members & invitations | Banner + disabled "Invite member"; placeholder rows all `@example.com` |
| F-45 | Roles & permissions | Banner: *"illustrate the intended default policy, not a configured, enforced system"* |
| F-46 | SSO / 2FA / IP allowlist | Every row disabled with "Not available yet" copy |

**Note on F-44/F-45:** the tables, models, migrations, and tests for
`organizations`, `memberships`, `roles`, and `invitations` all exist and pass.
Dual-write is **live in production**. Only the REST layer is missing — these are
closer to shipping than the UI implies.

---

## 8. Broken Features (3 — unintentional)

### 8.1 `BUG-01` · Checkout returns HTTP 500 on every call — **P0**

```python
# backend/app/api/v1/billing.py:83
plan = db.query(Plan).filter(Plan.id == request.plan_id).first()
#                                       ^^^^^^^ starlette Request, not `payload`
```

The handler binds the body to `payload: CheckoutSessionRequest` and the ASGI
request to `request: Request`. Line 83 reads `plan_id` off the wrong object and
raises an unhandled `AttributeError`. Confirmed live on Stripe (`J5`), Razorpay
(`J6`), and the not-found path (`J5b`). **No paying customer has ever been able
to subscribe.** No `tests/test_billing.py` exists.

**Fix:** `request.plan_id` → `payload.plan_id`. One token.

### 8.2 `BUG-05` · API keys authenticate nothing — **P0**

`app/utils/api_key_auth.py` defines `get_user_from_api_key()` and
`get_current_user_or_api_key()`. Grepping `backend/app/`, the only symbol ever
imported from that module anywhere is `generate_api_key`. Neither dependency is
attached to a single route. A brand-new active key sent as `X-API-Key` against
`GET /api/v1/clients` returns **401 `{"detail":"Not authenticated"}`** (`H12`),
while `/settings/api-keys` tells the user to *"Generate a key to start making
programmatic requests to the Voxly API."*

**Fix:** swap `Depends(get_current_user)` → `Depends(get_current_user_or_api_key)`
on the routes intended for programmatic access, or mark the feature Preview.

### 8.3 `DEBT-03` · Playwright E2E suite is stale — **P2 (test asset)**

**22 passed, 24 failed.** Every failure asserts against the pre-V3 UI that
commit `3d8ad0a` replaced — e.g. *"settings page with all 4 tabs"* when Settings
is now 9 routes under a shared shell. I verified independently that the routes
are healthy (`/settings` → 200 redirecting to `/settings/general`; both render
against a production build). **The product is fine; the tests are stale** — but
a permanently-red suite provides no regression protection.

---

## 9. Production Blockers (6)

Ordered by user impact. All confirmed by execution.

| # | Blocker | Impact | Effort |
|---|---|---|---|
| **P0-1** | `BUG-01` — checkout 500s on every call | **Zero revenue is collectable.** Pricing page invites an upgrade that crashes. | 1 line |
| **P0-2** | `BUG-02` — no `STRIPE_*` / `RAZORPAY_*` keys in production `env.yaml` | Even with P0-1 fixed, checkout fails at the gateway and every webhook callback is rejected by signature verification. | Config |
| **P0-3** | `BUG-03` — `?skip=-1` returns HTTP 500 on `/clients`, `/projects`, `/milestones` | Authenticated 500 vector on the three core list endpoints. **Invisible on SQLite** — only reproduces on Postgres, i.e. production. | ~6 lines |
| **P0-4** | `BUG-04` — `clients.phone` is globally unique across all tenants | Agency B **cannot onboard** a client whose number Agency A already holds. Soft-deleted clients squat their number permanently. Also a cross-tenant existence oracle. | Migration + code |
| **P0-5** | `BUG-05` — API keys authenticate nothing | A complete, polished feature that cannot work, with copy promising it does. | Small |
| **P0-6** | `BUG-06` — `RESEND_FROM_EMAIL` absent from production | Falls back to `onboarding@resend.dev`, which Resend only delivers to the account owner. **Password reset emails will not reach real users** — account recovery is broken in production. | Config + domain verify |

---

## 10. Security Blockers (7)

None permits authentication bypass or cross-tenant data access. Isolation held
on all 24 cross-tenant probes.

| # | Finding | Severity | Evidence |
|---|---|---|---|
| **S-1** | `BUG-08` — password change does not revoke existing tokens | **P1** | `S1`: pre-change JWT still returns 200 on `/auth/me`. No `jti`, no token version, no denylist. A stolen token survives the victim's remediation. |
| **S-2** | `BUG-09` — password-reset token is replayable for its full 15 min; confirm endpoint unthrottled | **P1** | `S2`: first redeem 200, replay 200. `S3`: 25 attempts, no 429. Token isn't bound to the current password hash. |
| **S-3** | `BUG-10` — reset token presented as Bearer → HTTP 500 | **P1** | `S7`: uncaught `ValueError: badly formed hexadecimal UUID string`. `decode_access_token` verifies `iss`/`aud` but no `scope`/type claim — separation is accidental, not enforced. |
| **S-4** | `BUG-11` — AI context handler injects raw driver exceptions + full SQL into the LLM system prompt | **P1** | Reproduced on Postgres with `context="project:not-a-uuid"`, `"project:"`, and `"project:'; DROP TABLE users; --"` — each returned `psycopg2.errors.InvalidTextRepresentation` plus the `SELECT` text. Query is parameterised (no injection); this is schema disclosure any authenticated user can trigger, and the model may echo it. |
| **S-5** | `BUG-12` — HSTS never emitted in production | **P1** | Live probe of `/health` returns all five baseline headers but **no** `Strict-Transport-Security`. The middleware gates on `request.url.scheme == "https"`; behind Cloud Run's TLS-terminating proxy the app sees `http`, and no `ProxyHeadersMiddleware` corrects it. |
| **S-6** | `BUG-16` — no rate limit on `/auth/refresh`, `/password-reset/confirm`, `/auth/github/callback`, `/ai-keys/{id}/validate` | **P2** | `S3`–`S6`: 25–40 consecutive calls, no 429. The last one calls an external provider on every request (cost exposure). Carried over unfixed from the 2026-03-10 audit's deferred list. |
| **S-7** | `BUG-17` — WebSocket JWT travels as a query parameter | **P2** | `useWebSocket.ts:59` — lands in Cloud Run request logs and any intermediary access log. Known since 2026-03-10, still open. |

### Verified secure

CORS rejects hostile origins in production · all webhook signatures enforced
(GitHub HMAC, Twilio, Telegram, Stripe, Razorpay) · SSRF host allowlist + 50 MB
zip cap on GitHub log fetch · BYOK keys Fernet-encrypted at rest, never echoed ·
API key material returned exactly once, never in list responses · OAuth CSRF
state cookie-bound and `httponly` · super admin dual-factor gated and hidden from
the OpenAPI schema · `is_active` enforced on every request (super-admin disable
takes effect immediately) · SQL-injection-shaped and XSS-shaped inputs handled
safely · GDPR export leaks no password hash or key material · 404 bodies carry
no stack traces · Swagger hidden with `DEBUG=false` (verified: `/docs` → 404) ·
**24/24 cross-tenant isolation probes passed.**

---

## 11. UX Blockers (5)

| # | Issue | Why it matters |
|---|---|---|
| **U-1** | Pricing and `/settings/billing` invite an upgrade that returns 500 | The single worst moment in the product: a user decides to pay and the app crashes. |
| **U-2** | `/settings/api-keys` says *"Generate a key to start making programmatic requests"* — the key returns 401 everywhere | Promises a capability that does not exist. Users will debug their own integration for hours. |
| **U-3** | Client phone conflicts return *"This Telegram Chat ID is already linked to another client"* | Actively misleading. The handler matches `"telegram" in str(e).lower()`, and the SQLAlchemy exception embeds the full `INSERT` column list — so the wrong branch always wins. |
| **U-4** | Deleting a client doesn't reduce dashboard counts or free quota | A Free-plan user (5 clients) can be locked out of an allowance they aren't using. Reads as a billing bug to the user. |
| **U-5** | Conversation Center "Take over" / "Approve" buttons are inert; status is guessed client-side | Both real backend endpoints exist (F-16). The controls look functional and do nothing. |

---

## 12. Technical Debt (9)

| # | Item | Severity |
|---|---|---|
| **DEBT-01** | 2 account-deletion tests fail on the default local SQLite lane — SQLite doesn't enforce FKs without `PRAGMA foreign_keys=ON`, so `ON DELETE CASCADE` never fires. With the pragma on: **7/7 pass**. The file's docstring claims they'd "pass identically" — that's wrong. Developers see red locally and CI green. | P2 |
| **DEBT-02** | **The test suite makes live Twilio calls with production credentials.** Client/project creation fires unstubbed notification hooks; the audit run logged `HTTP 429 … exceeded the 50 daily messages limit`. Every full local run burns real quota, can page real numbers, and makes results depend on an external rate limit. | **P1** |
| **DEBT-03** | Playwright E2E suite 24/46 failing — asserts the pre-V3 UI. No regression protection, and it trains the team to ignore red. | P2 |
| **DEBT-04** | Container `CMD` is `alembic upgrade head \|\| echo 'Migration skipped…'` — **a failed migration is swallowed and the server starts anyway.** Schema drift deploys silently. | P2 |
| **DEBT-05** | `get_or_create_personal_org` docstring still says *"there's no unique constraint on organizations.owner_user_id today"* — migration `5b8e3c1f9a2d` added it. Stale reasoning in a concurrency-sensitive function. | P3 |
| **DEBT-06** | Alembic `compare_metadata` reports the model missing `unique=True` on `organizations.owner_user_id`, `organizations.slug`, `invitations.token` where the migration declares it. Functionally equivalent on Postgres, but the SQLite test lane runs **without** those constraints. | P2 |
| **DEBT-07** | The WebSocket connection manager is **in-process**. Past one Cloud Run instance, a broadcast only reaches sockets on the emitting instance. Realtime silently degrades under autoscale. | P2 |
| **DEBT-08** | slowapi uses **in-process** counters. Past one instance, every rate limit multiplies by the instance count. The provisioned Upstash Redis is not used as the limiter backend. | P2 |
| **DEBT-09** | 66 ESLint warnings (unused imports, `no-explicit-any`); 1,548 `datetime.utcnow()` deprecation warnings; `app/utils/phone.py::normalize_phone` is correct, complete, and **called from nowhere**. | P3 |

### Coverage gaps

No `tests/test_billing.py` (root cause of `BUG-01`), no API-key-auth tests
(would have caught `BUG-05`), no pagination-bounds tests (would have caught
`BUG-03`), no soft-delete accounting tests (would have caught `BUG-07`), no
session-revocation tests (would have caught `BUG-08`). **Every P0 and P1 in this
report sits in an untested area. That correlation is the report's main finding.**

---

## 13. Release Readiness Score

### 63 / 100 — Not ready for v1.0.0

| Area | Score | Basis |
|---|---:|---|
| Multi-tenant isolation | **95** | 24/24 probes passed. One namespace defect (`BUG-04`), no data leakage. |
| Core CRUD (clients/projects/milestones) | **78** | 29/33. Input-validation and pagination gaps. |
| Authentication & OAuth | **85** | 21/24. Both OAuth flows solid; session revocation missing. |
| Conversations & realtime | **90** | 17/17 backend. Best-engineered subsystem; frontend under-consumes it. |
| AI pipeline | **85** | Multi-provider, tools, context isolation all work. One disclosure defect. |
| Integrations (WhatsApp/Telegram/GitHub) | **90** | All signature paths verified. Celery not deployed. |
| **Billing & monetisation** | **15** | **Checkout 500s. No gateway secrets in production. Zero test coverage.** |
| API keys (programmatic access) | **35** | Management perfect; authentication wired to nothing. |
| Organization & team | **45** | Data layer live in production; zero REST surface. Honestly labelled. |
| Security posture | **72** | Strong perimeter; 4 session/token weaknesses, 4 throttle gaps, HSTS absent. |
| Test & CI health | **60** | 244/244 on Postgres, but 2 red locally, 24 red in E2E, live Twilio calls, and the revenue path untested. |
| Frontend build & UX honesty | **92** | Clean build, 0 TS errors, 32 routes. Preview labelling is exemplary. |
| Deployment & operations | **65** | Live, gated, headers set. Missing secrets, no worker, migrations fail-open, manual `env.yaml` sync. |

**Composite: 63/100.** Ship-blocking weight sits almost entirely in Billing (15)
and API keys (35) — two areas where completed, polished UI fronts a backend that
cannot work.

---

## 14. Recommendations Before v1.0.0

### Phase 1 — Blockers (~1–2 days)

1. **Fix checkout.** `billing.py:83` → `payload.plan_id`. Audit the other three
   handlers in that file for the same `request` / `payload` confusion.
2. **Write `tests/test_billing.py` first, then fix.** Checkout happy path with
   mocked gateways, unknown plan → 404, free plan → 400, both webhook signature
   paths. This one file is the difference between this class of bug shipping and
   not shipping.
3. **Add the gateway secrets** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) to
   `env.yaml` and redeploy. Verify with a real test-mode transaction end-to-end.
4. **Clamp pagination** on `/clients`, `/projects`, `/milestones`:
   `skip = max(skip, 0)`, `limit = min(max(limit, 1), 100)` — matching what
   `/chat/messages` already does correctly. Add a parametrised bounds test.
5. **Decide the phone-uniqueness model.** Either drop the global unique index and
   add a composite `unique(user_id, phone) WHERE deleted_at IS NULL`, or keep it
   global and say so in the UI. Today's behaviour — global constraint, per-tenant
   check, misleading error — is the one option that is wrong under any reading.
   Fix the error-branch detection while you're there (match on the constraint
   name, not on `str(e)`).
6. **Wire or withdraw API-key auth.** Attach `get_current_user_or_api_key` to the
   routes meant for programmatic access, or add a `PreviewBanner` to
   `/settings/api-keys`. Do not ship the current state.
7. **Set `RESEND_FROM_EMAIL`** to a verified domain and send a real reset to a
   non-owner address to prove delivery.

### Phase 2 — Security (~1 day)

8. Invalidate sessions on password change — add a `token_version` column, embed
   it in the JWT, compare in `get_current_user`. This closes `BUG-08` and gives
   you a revocation primitive you'll need anyway.
9. Make reset tokens single-use — include the current password hash (or a `jti`
   persisted and burned on redemption) so a redeemed token cannot be replayed.
10. Add `scope`/type checking to `decode_access_token` and wrap the `UUID()`
    parse in a `try` → clean 401 instead of a 500.
11. Sanitise the AI context error handler — log the exception, put a fixed string
    in the prompt (`"[System Error]: Project context unavailable."`).
12. Add `ProxyHeadersMiddleware` (or trust `X-Forwarded-Proto`) so HSTS is
    actually emitted behind Cloud Run.
13. Add the four missing rate limits: `/auth/refresh`, `/password-reset/confirm`,
    `/auth/github/callback`, `/ai-keys/{id}/validate`.

### Phase 3 — Correctness & test health (~1 day)

14. Add `Client.deleted_at.is_(None)` to the dashboard and billing-usage queries.
    Add a soft-delete accounting test.
15. Add `max_length` to `ClientCreate.name` / `company` (and audit the other
    schemas) so over-length input is a 422, not a 500.
16. Wire `normalize_phone` into client create/update — it's already written and
    correct — and validate at the schema layer.
17. In `conftest.py`: enable `PRAGMA foreign_keys=ON` for SQLite and autouse-stub
    `whatsapp_service.send_whatsapp_message`. Delete the incorrect "pass
    identically on SQLite" claim from the account-deletion docstring.
18. Rewrite `frontend/tests/{dashboard,settings}.spec.ts` against the V3 IA, or
    delete them. A permanently-red suite is worse than no suite.

### Phase 4 — Close the frontend gap (~1 day, highest ROI)

19. Point `/messages` at `GET /chat/conversations` and wire the status endpoints
    to the "Take over" / "Approve" buttons. Five tested endpoints (F-15, F-16)
    start delivering value with no new backend work.
20. Point `/channels` at `GET /api/v1/channels` and drop the fabricated Email row.
21. Surface `POST /notifications/send` on the client detail page.

### Phase 5 — Operations (before scale, not before v1.0.0)

22. Deploy a Celery worker + beat, or move GitHub sync to Cloud Scheduler → an
    authenticated HTTP endpoint. Today the scheduled sync does not run at all.
23. Make migrations fail-closed: drop the `|| echo` from the container `CMD`, or
    run migrations as a separate pre-deploy job.
24. Move rate-limit and WebSocket state to the Upstash Redis you already pay for,
    before Cloud Run scales past one instance.
25. Generate `env.yaml` from a checked-in template with a required-key assertion
    so a missing `STRIPE_SECRET_KEY` fails the deploy instead of the checkout.

---

## Closing Assessment

Voxly is roughly **one focused week** from a defensible v1.0.0. The gap is not
architectural — multi-tenancy, conversation runtime, account deletion, webhook
security, and the AI pipeline are all built properly and pass under adversarial
testing. What's missing is coverage on the paths that carry money and access.

The strongest signal in this audit: **every P0 and P1 defect lives in code with
no test.** The billing router has zero tests and is the only fully broken
feature. `api_key_auth.py` has no tests and is wired to nothing. Pagination
bounds have no tests and 500 on production Postgres. Soft-delete accounting has
no tests and miscounts. Meanwhile the areas with real coverage — conversations
(6 test modules), account deletion (7 integration tests), tenant context (5
modules), webhooks — are the areas that passed cleanly.

Fix the six blockers, close the seven security findings, and add the five missing
test files. Do that and the release-readiness score moves from **63 to roughly 88**
without a single new feature.

---

*Audit executed 2026-07-27 against `develop` @ `1907890`. 480 checks across 7
lanes: 433 passed, 46 failed, 1 not implemented. No source file was modified;
the audit Postgres container was removed on completion and `git status` shows
the working tree unchanged.*
