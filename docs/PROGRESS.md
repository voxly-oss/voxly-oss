# Voxly — Progress & Next Plan

> Living status of the production-hardening effort on branch `anupam/development`.
> Companion to `DUE_DILIGENCE.md` (findings F1–F20).
>
> _Last updated: 2026-07-02_

---

## TL;DR

Fixed the broken revenue path and freemium leak, then hardened the core for production.
**4 commits on `anupam/development`, 62 tests passing** (33 pre-existing + 29 new), frontend
`tsc` clean, Alembic single linear head. Phase 0 (critical) is **done**; Phase 1 (hardening)
is **6 of 7 items done** — only per-tenant WhatsApp numbers remain.

| Commit | Scope | Tests |
|---|---|---|
| `6d1d931` | P0 — critical fixes (billing, entitlements, metering, API-key auth, GDPR) + UI | 42 |
| `7a9b4b6` | P1.3/1.5/1.7 — conversation memory, message idempotency, deep health | 50 |
| `b9d408b` | P1.4 + P1.6 — durable Celery processing, complete payment webhooks | 56 |
| `dab5fec` | P1.7 — refresh-token rotation + BYOK key decoupling | 62 |

---

## ✅ What's done

### Phase 0 — Critical fixes (revenue + trust)

| ID | Fix | Where |
|---|---|---|
| **F1** | Checkout no longer 500s — was `request.plan_id` on the Request object | `api/v1/billing.py` |
| **F2** | Plan limits **enforced** (HTTP 402 + structured detail) on client/project creation and the AI-message pipeline | `utils/entitlements.py`, `clients.py`, `projects.py`, `messaging_core.py` |
| **F3** | **Real usage metering** — per-tenant Redis counters via middleware + AI-message tracking | `main.py`, `utils/auth.py`, `messaging_core.py` |
| **F4** | API keys now **authenticate** real endpoints — scoped dual-auth (`require_scope`) on clients/projects. **Bonus:** API-key hashing moved from bcrypt (72-byte limit → crash) to SHA-256 | `utils/api_key_auth.py`, `clients.py`, `projects.py` |
| **F5** | GDPR data export fixed (crashed on a bad `app.models.ai_key` import) | `api/v1/auth.py` |
| UI | Global **402 → upgrade modal** + **plan-usage meter** on the dashboard | `components/UpgradeModal.tsx`, `components/UsageMeter.tsx`, `lib/api.ts` |

### Phase 1 — Hardening (6 of 7)

| ID | Item | Notes |
|---|---|---|
| **1.3** | **Conversation memory** | Agent loads the last 6 exchanges (`_load_recent_history` → `VoxlyAgent.chat(history=)`). No longer amnesiac. |
| **1.5** | **Message idempotency** | `ProcessedMessage` ledger + `is_duplicate_message()`; dedupes WhatsApp `MessageSid` and Telegram `update_id`. No double replies / token spend. |
| **1.7-h** | **Deep health checks** | `/health` + `/health/live` shallow (liveness); `/health/ready` checks DB + Redis, returns 503 with a per-dependency breakdown. |
| **1.4** | **Durable Celery processing** | `USE_CELERY` flag + `tasks/dispatch.py`: Celery when enabled (retried, restart-safe), else in-process (dev/tests). `worker` + `beat` added to docker-compose. Fixed latent bug: `github_service` built a PyGithub client at import (crashed on empty token) — now lazy. |
| **1.6** | **Payment webhooks completed** | Idempotency (Stripe `event.id` / Razorpay payment id), `current_period_start/end` + `cancel_at_period_end`, `customer.subscription.updated/created`. |
| **1.7-s** | **Security hardening** | (a) Refresh-token rotation — `RefreshToken` model, single-use rotating tokens, `POST /auth/token/refresh` + `/auth/logout`, issued on password/Google/GitHub login; frontend silent-refresh on 401. (b) BYOK encryption moved off `SECRET_KEY` to a dedicated `ENCRYPTION_KEY` with seamless decrypt fallback. |

### Database migrations added
- `b2c3d4e5f6a7` — `processed_messages` (idempotency ledger)
- `c3d4e5f6a7b8` — `refresh_tokens`

Single linear head confirmed.

### Verification
- Backend: **62 tests pass** on Python 3.11 (new suites: `test_billing.py`, `test_entitlements.py`, `test_p0_regressions.py`, `test_p1_features.py`, `test_p1_billing.py`, `test_p1_auth.py`).
- Frontend: `tsc --noEmit` exit 0.
- Alembic: single linear head.

Run locally:
```bash
cd backend
python -m pytest tests/ -q          # needs Python 3.10+ (project targets 3.10+)
```

---

## 🔜 Next plan

### Immediate: open the PR
Branch `anupam/development` → `main`:
`https://github.com/voxly-oss/voxly-oss/compare/main...anupam/development?expand=1`

### Last Phase 1 item — P1.1 + P1.2 (ship together)
**Per-tenant WhatsApp numbers (Twilio subaccounts — decided) + composite-unique tenancy.**
These are coupled: allowing duplicate client phones across tenants is only safe once inbound
routing can disambiguate by the **destination** number. Plan:
1. `AgencyChannel` model (`user_id`, `channel`, `provider_number`, `twilio_subaccount_sid`, `status`).
2. Provision numbers via Twilio subaccounts behind a stubbed interface (unit-testable without live Twilio).
3. Route inbound by the `To` number → resolve tenant → resolve client within tenant.
4. Migration: drop global-unique on `Client.phone`/`telegram_chat_id`; add composite unique `(user_id, phone)` / `(user_id, telegram_chat_id)`.
5. Tenant-isolation tests (Agency A can never read/route Agency B's data).

> Everything except the live Twilio API call is testable locally; real credentials are wired at deploy time.

### Then — Phase 2 (B2B UI/UX) & Phase 3 (enterprise)
See `IMPLEMENTATION_PLAN.md` (local; gitignored by repo policy). Highlights:
- **P2:** onboarding wizard, unified inbox + human handoff, analytics dashboard, white-label branding, i18n/a11y, public client status page.
- **P3:** Teams + RBAC, audit logs, AI Risk Radar (proactive project-health digests), SSO/SCIM, Linear/Jira/Slack integrations, MCP server.

### Known follow-ups / tech debt
- Reconcile the dual entitlement source of truth (`User.subscription_tier` vs `Subscription→Plan`) — make the subscription authoritative (F10).
- GitHub repo mapping by immutable `repo_id` instead of `full_name` (F17).
- Chat-history retention/partitioning (F15).
- Production deploy manifests (compose.prod / K8s), backend APM/metrics, DB backup runbook.
