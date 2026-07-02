# Voxly — Technical & Product Due Diligence

> Evidence-based review of the current codebase (backend + frontend + infra).
> Every finding is traced to real code. Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low.
>
> _Last reviewed: 2026-07-02_

---

## 1. Product in one paragraph

Voxly is an **AI communication layer between software agencies and their non-technical clients**. Clients text a WhatsApp/Telegram number; an AI agent answers project-status questions **grounded in live GitHub data + milestones**, and translates vague feedback ("I don't like the color") into developer-ready specs. In reverse, GitHub push / CI-failure webhooks trigger proactive client updates and AI root-cause analysis. Strong **India-first** signal (Hinglish system prompt, Razorpay, WhatsApp-centric).

The **differentiated wedge** — turning GitHub activity into client-ready WhatsApp updates — is a genuine white space. No competitor (Wati/AiSensy for WhatsApp, SuiteDash/Bonsai for portals) does dev-context-grounded client comms.

---

## 2. What works vs what's broken

| State | Features |
|---|---|
| ✅ **Working** | JWT auth, Google/GitHub OAuth, client/project/milestone CRUD (tenant-scoped), WhatsApp + Telegram inbound pipeline, GitHub webhook (push + CI-failure AI analysis), multi-provider AI + fallback (Gemini→OpenAI→Claude), ReAct agent + GitHub tools, vision (screenshot→issue), BYOK (Fernet), super-admin console, password reset (Resend), security headers/HMAC/rate limiting, CI/CD + scanners |
| 🟡 **Decorative / partial** | Billing checkout (**broken**), payment webhooks (no idempotency/period dates), usage metering (read-only), plan limits (defined, **never enforced**), API keys (mintable, **unusable for auth**), GDPR export (**crashes**) |
| 🔴 **Missing** | Conversation memory, per-tenant WhatsApp numbers, teams/RBAC, audit logs, analytics, message templates/broadcasts, Slack, tenant-isolation tests |

---

## 3. Critical findings (🔴 — block production / revenue)

### F1 — Paid checkout is broken
**File:** `backend/app/api/v1/billing.py:81`
```python
plan = db.query(Plan).filter(Plan.id == request.plan_id).first()
```
`request` is the FastAPI `Request` object; the body is `payload: CheckoutSessionRequest`. `request.plan_id` raises `AttributeError` → 500 on **every** checkout. **You cannot take money.** Fix: `payload.plan_id`.

### F2 — Plan limits are never enforced
`max_clients`, `max_projects`, `max_ai_messages_per_month` are defined on `Plan` and seeded, but no create endpoint checks them (verified: grep finds them only in `billing.py`). A Free user can create unlimited clients/projects/messages. **The freemium model is unmonetizable.**

### F3 — Usage metering never records
`get_usage_tracker()` is only ever *read* (`billing.py:323`). Nothing calls `track_request` / `record_ai_message`. Usage dashboards and quotas will always show/allow everything.

### F4 — Public API keys can't authenticate anything
`api_keys.py` mints keys, but no route depends on `api_key_auth` (verified: no `require_api_key`/`get_api_key_user` consumer). The advertised "programmatic API access" is a phantom feature.

### F5 — GDPR data export crashes
**File:** `backend/app/api/v1/auth.py:621`
```python
from app.models.ai_key import AIKey        # module does not exist
...
"provider": k.provider_name,               # field is `provider`
```
`app/models/ai_key.py` does not exist (model is `user_ai_key.UserAIKey`) → `ImportError` → 500. The compliance export is dead.

---

## 4. High-severity findings (🟠)

### F6 — Multi-tenancy is leaky at the messaging layer
- A **single shared Twilio number** serves the entire platform. All agencies' clients text the same number.
- `Client.phone` is **globally `unique=True`** (`models/client.py`), so two agencies **cannot** have the same client contact — and `find_client_by_phone` (`messaging_core.py:32`) resolves clients with **no tenant scope**. This blocks white-labeling and breaks the "Agency OS" positioning the moment two tenants share a contact.

### F7 — Critical async work runs on `BackgroundTasks`, not Celery
Inbound AI processing (`whatsapp.py`) and GitHub webhook handling (`github.py`) use FastAPI `BackgroundTasks`. On process restart the task is silently lost — no retry, no dead-letter. Celery is installed and configured (`app/tasks/`) but hot paths don't use it.

### F8 — No conversation memory
`VoxlyAgent.chat()` builds a fresh message list every call. `ChatHistory` is persisted but never loaded back into context. The assistant is amnesiac — the single biggest UX/retention gap.

### F9 — Payment webhooks are incomplete
`billing.py:253+`: no idempotency (Stripe/Razorpay retries double-apply), `current_period_start/end` never set, no `customer.subscription.updated` handling, Razorpay returns a `razorpay://` deep link a web dashboard can't consume.

### F10 — Dual source of truth for entitlements
`User.subscription_tier` (legacy string) and the `Subscription→Plan` relationship both encode plan tier and are updated in different places (webhooks set both; super-admin override sets only the string). Guaranteed drift.

---

## 5. Medium / low findings

- 🟡 **F11 — No message idempotency.** Twilio retries a `MessageSid` → duplicate AI replies + double token spend.
- 🟡 **F12 — JWT in `localStorage`** (`frontend/lib/api.ts`) — XSS-exfiltratable. 30-min tokens with a `/refresh` that needs a still-valid token → users get logged out mid-session, no silent refresh.
- 🟡 **F13 — `SECRET_KEY` is dual-use** — signs JWTs *and* derives the BYOK Fernet key (`ai_keys.py:83`). Rotating it bricks every stored key.
- 🟡 **F14 — Shallow `/health`** — returns static `{"status":"healthy"}`; doesn't check DB/Redis. Useless for real orchestration.
- 🟡 **F15 — Unbounded `chat_history`** — no retention/partitioning; grows forever.
- 🟡 **F16 — Sync DB (psycopg2) under async routes** — blocking calls occupy the event loop; scaling ceiling.
- 🟡 **F17 — Repo mapping by exact `full_name`** — a GitHub repo rename silently breaks all alerts.
- 🔵 **F18 — Roadmap/README drift** — rate limiting listed as "Next v2.1" but already shipped; Claude advertised but disabled in code (`DEFAULT_PROVIDER="gemini"`, "billing broken since March 2026").
- 🔵 **F19 — `DEBUG=true` default in `.env.example`** exposes Swagger/ReDoc if copied verbatim to prod.
- 🔵 **F20 — Test gaps** — billing, usage, plan limits, and the messaging pipeline are untested (which is why F1–F3 shipped). ~836 test LOC total, concentrated in auth/tenant/webhook.

---

## 6. Strengths worth preserving

- **Excellent AI provider abstraction** + retryable-error fallback chain (`ai_service.py`).
- **Channel-unified pipeline** (`messaging_core.py`) — WhatsApp + Telegram share one path.
- **Security depth beyond its age** — HMAC webhooks, Twilio signature validation with proxy-aware URL reconstruction, SSRF allowlists (image + log fetch), zip-bomb cap, security headers, disposable-email blocklist, CVE-motivated dependency pins.
- **Strong DevX** — `npx create-voxly`, Docker Compose, GitHub Actions (CI + container/secret/security scans), SonarCloud, Husky.
- **The CI-failure → AI analysis → WhatsApp loop is a genuinely unique feature.**

---

## 7. Scorecard

| Dimension | Score | One-line rationale |
|---|---|---|
| Overall Product | **6.0 / 10** | 8/10 bones, ~5/10 working reality |
| B2B Readiness | **4.0 / 10** | Tenant-scoped data but no teams, shared number, broken billing |
| Enterprise Readiness | **2.5 / 10** | No RBAC/SSO/audit/white-label; leaky isolation |
| Commercial Potential | **7.0 / 10** | Real white space + PLG on-ramp; gaps are executional, not conceptual |

**Bottom line:** Fund the team and the wedge, not current revenue readiness. ~4–8 weeks on the P0/P1 plan (see `IMPLEMENTATION_PLAN.md`) flips this to a credible commercial beta.
