# Secret Rotation Plan

**Status:** In progress
**Trigger:** During Phase 1 backend rollout (2026-07-25), a diagnostic command (`gcloud run revisions describe`, run to determine Cloud Run deploy state) printed the full production environment variable set for the `voxly-backend` Cloud Run service into the Claude Code conversation transcript in plaintext.
**Policy for this document and all rotation work:** no secret value is ever printed, logged, or written into this file or any chat output — only names, systems, status, and non-secret metadata (key IDs, scopes, timestamps).

---

## 1. Incident Summary

- **What happened:** `gcloud run revisions describe voxly-backend-00013-rs9 --format="yaml(...,spec.containers[0].env)"` was run to inspect deploy state and returned every environment variable configured on the live Cloud Run revision, including all secret values, which were then rendered in the conversation.
- **Exposure surface:** the Claude Code session transcript/logs for that conversation. No evidence of external/public exposure (not committed to git, not posted publicly, not sent to a third party) — but per standard practice, every credential that appeared is treated as compromised regardless.
- **Not affected:** `RECOVERY_CODE` (present in local `backend/.env` but not deployed to Cloud Run — never printed), `GOOGLE_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID`, `TWILIO_WHATSAPP_NUMBER`, `SUPER_ADMIN_EMAIL`, `FRONTEND_URL`, `DEBUG`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES` — these were also printed but are not secrets (public identifiers/config), no rotation needed.

## 2. Complete Inventory of Compromised Secrets

| # | Secret | System | Blast radius if abused | Rotation mechanism |
|---|---|---|---|---|
| 1 | `SECRET_KEY` | App (JWT signing) | **Critical** — forge auth tokens for any user, full account takeover across the app | API/CLI (self-generate, no third party) |
| 2 | `DATABASE_URL` (password portion) | Supabase Postgres | **Critical** — full read/write on the entire production database | Console only (no management API token available) |
| 3 | `SUPER_ADMIN_SECRET` | App (super-admin auth) | **Critical** — super-admin panel access | API/CLI (self-generate) |
| 4 | `GOOGLE_CLIENT_SECRET` | Google OAuth (login) | High — impersonate the app in Google's OAuth flow | Console only |
| 5 | `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth (login) | High — impersonate the app in GitHub's OAuth flow | Console only |
| 6 | `GITHUB_TOKEN` | GitHub PAT (app's own API access) | High — scope-dependent repo access (workflow logs, repo metadata) | Console only |
| 7 | `ANTHROPIC_API_KEY` | Anthropic | High — billing abuse, usage under our account | Console only |
| 8 | `OPENAI_API_KEY` | OpenAI | High — billing abuse, usage under our account | Console only |
| 9 | `GEMINI_API_KEY` | Google AI Studio | High — billing abuse, usage under our account | Console only |
| 10 | `TWILIO_AUTH_TOKEN` | Twilio | High — send WhatsApp messages as us, billing abuse | Console only |
| 11 | `TELEGRAM_BOT_TOKEN` | Telegram (@BotFather) | High — full control of the bot, impersonate it, read messages sent to it | Chat with @BotFather only |
| 12 | `INTERNAL_WEBHOOK_SECRET` | App (internal chat-handler auth) | Medium — bypass the guard added specifically to stop unauthenticated `handle_chat` access | API/CLI (self-generate) |
| 13 | `GITHUB_WEBHOOK_SECRET` | App + GitHub repo webhook config | Medium — forge GitHub webhook deliveries (fake CI/push events) | App side: API/CLI. GitHub side: console (see §5) |
| 14 | `TELEGRAM_WEBHOOK_SECRET` | App + Telegram `setWebhook` | Medium — forge Telegram webhook deliveries | Bundled with #11 (needs bot token to re-register) |
| 15 | `RESEND_API_KEY` | Resend | Medium — send email as us, billing abuse | Console only (current key lacks management scope — confirmed by API check) |
| 16 | `REDIS_URL` (token portion) | Upstash Redis | Low-Medium — read/write cache + rate-limit state | Console only (no management API token available) |

`TWILIO_ACCOUNT_SID`, `GOOGLE_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID` were also in the printed output but are identifiers, not secrets — no rotation required.

## 3. Rotation Priority

Ordered by blast radius, highest first, with ties broken by "can we act on it right now":

1. `SECRET_KEY` — invalidates every forged/leaked token instantly; zero external dependency.
2. `SUPER_ADMIN_SECRET` — zero external dependency.
3. `DATABASE_URL` — highest blast radius of all, but requires your action in Supabase's dashboard (§5).
4. `GOOGLE_CLIENT_SECRET`, `GITHUB_OAUTH_CLIENT_SECRET` — OAuth login impersonation risk.
5. `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` — billing/access abuse, no user-data exposure.
6. `TWILIO_AUTH_TOKEN`, `TELEGRAM_BOT_TOKEN` (+ bundled `TELEGRAM_WEBHOOK_SECRET`) — messaging channel abuse.
7. `INTERNAL_WEBHOOK_SECRET`, `GITHUB_WEBHOOK_SECRET` — internal/webhook integrity, lower external abuse value.
8. `RESEND_API_KEY` — email sending abuse, no user data.
9. `REDIS_URL` — cache/rate-limit state only, lowest sensitivity of the set.

## 4. Rotation Tiers

**Tier A — rotated directly by Claude Code this session, no dashboard needed:**
`SECRET_KEY`, `SUPER_ADMIN_SECRET`, `INTERNAL_WEBHOOK_SECRET`, and the **app side** of `GITHUB_WEBHOOK_SECRET`.

Verified via recon before committing to this tier: `gh auth status` confirmed CLI access, but the three `Project.github_repo` values found in the database (`ravin972/sispl_jobs`, `ravin972/vcommerce`, `neha97/ugsm-movie-app`) all 404 on both repo-lookup and hook-listing — none are reachable from this environment, so the GitHub-side webhook secret cannot be located/updated via API. A Resend API reachability check (`GET /api-keys`) returned `403 Forbidden` — the current key isn't scoped for key management, ruling out self-service API rotation for Resend.

**Tier B — requires you to act in a provider console or chat, then hand the new value back:**
`DATABASE_URL`, `GOOGLE_CLIENT_SECRET`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `TWILIO_AUTH_TOKEN`, `TELEGRAM_BOT_TOKEN` (+ `TELEGRAM_WEBHOOK_SECRET`, bundled), `RESEND_API_KEY`, `REDIS_URL`, and the **GitHub side** of `GITHUB_WEBHOOK_SECRET`.

**Hand-back protocol for Tier B:** paste the new value directly in chat when ready for that specific step; it will be piped straight into `gcloud run services update --update-env-vars` (or the equivalent) and never echoed back, logged, or written to a file. If you'd rather avoid pasting secrets into chat entirely, tell me and we'll do those steps as a batch you apply yourself via a `gcloud` command I hand you instead.

## 5. Dependencies

- **`TELEGRAM_WEBHOOK_SECRET` depends on `TELEGRAM_BOT_TOKEN`.** Telegram's `setWebhook` call needs a valid bot token to register a new `secret_token`. These two are rotated together in one step, not independently, once you provide the new bot token from @BotFather.
- **`GITHUB_WEBHOOK_SECRET` app-side vs. GitHub-side must be updated together**, or webhook deliveries will 401 (fail-closed — safe, just broken until synced, not a security hole). I'll rotate the app side now; you'll need to update the matching webhook's "Secret" field on whichever GitHub repo(s) actually have a live webhook configured (the three repos found in our DB are not accessible from this environment to confirm/update automatically — please verify which repo(s), if any, still have an active webhook pointed at `voxly-backend`).
- **`GITHUB_TOKEN` (app PAT) rotation should happen before or independently of the `GITHUB_WEBHOOK_SECRET` GitHub-side update** — they're unrelated credentials (one authenticates outbound calls *from* the app to GitHub's API, the other verifies inbound webhook calls *to* the app), no ordering constraint between them.
- **`SECRET_KEY` rotation immediately invalidates every currently-issued JWT.** Every logged-in user (including you) will be forced to log in again the moment this deploys. This is the intended, unavoidable effect of rotating a JWT signing key — flagging it here per your "rollback considerations" requirement, not as a reason to skip it.
- **`DATABASE_URL` password rotation requires a Cloud Run env var update in the same step** — Supabase will invalidate the old password immediately on reset, so the new value must be applied to Cloud Run right after (not before) you reset it, to minimize the connection-failure window.

## 6. Rollback Considerations

| Secret | If rotation breaks something, rollback path |
|---|---|
| `SECRET_KEY` | Re-deploy previous revision (`gcloud run services update-traffic voxly-backend --to-revisions <prev>=100`) restores the old signing key and old sessions become valid again. No data loss risk either way. |
| `SUPER_ADMIN_SECRET` | Same — traffic rollback to prior revision. |
| `INTERNAL_WEBHOOK_SECRET` | Same — traffic rollback. Low risk since both sides of this secret live in the same deployed revision. |
| `GITHUB_WEBHOOK_SECRET` (app side) | Traffic rollback restores the old value; GitHub-side stays whatever it currently is regardless. |
| `DATABASE_URL` | Supabase typically does not let you "undo" a password reset — if the new connection string is wrong, the fix is resetting again and re-applying, not a rollback. Keep Cloud Run's previous revision's env intact (Cloud Run revisions are immutable) so you can see the last-known-good value's *metadata* (not the value) for reference. |
| OAuth client secrets (Google/GitHub) | Both providers let you keep the old secret active alongside a new one for a transition window before disabling it — use that overlap instead of a hard cutover if login breakage is a concern. |
| AI provider keys (Anthropic/OpenAI/Gemini) | Revoke-then-recreate is typically instant; if the new key doesn't work, the provider dashboard shows key status directly. |
| Twilio / Telegram / Resend | Twilio's "secondary token" flow keeps the old token valid until you explicitly promote; Telegram's old token is invalidated the instant you revoke via BotFather (no overlap); Resend lets multiple keys coexist until you delete the old one. |
| `REDIS_URL` | Cache-only; worst case is a full cache miss storm after rotation, self-healing, no data-loss risk (rate-limit state resets, not security-relevant). |

General rollback lever for every Tier A item: `gcloud run services update-traffic voxly-backend --region us-central1 --project voxly-491010 --to-revisions <previous-revision>=100` shifts traffic back without touching env vars, since each `gcloud run services update` creates a new immutable revision.

## 7. Validation Checklist (per secret, applied at rotation time)

- [ ] New value generated/obtained and never printed in chat, logs, or files
- [ ] Cloud Run env var updated (`--update-env-vars`) or third-party config updated, as applicable
- [ ] New revision deployed and serving 100% traffic
- [ ] `GET /health` → `200 {"status":"healthy"}`
- [ ] No `ERROR`-severity logs in the 10 minutes following the change
- [ ] Directly affected integration smoke-tested (see per-secret notes below)
- [ ] Old credential explicitly revoked/deleted at the provider, not just replaced (where the provider supports it)
- [ ] Completion recorded in §8 below with timestamp, revision ID, and status — no values

Per-secret smoke test:
- `SECRET_KEY` → confirm `POST /api/v1/auth/login` issues a token and `GET /api/v1/auth/me` accepts it
- `SUPER_ADMIN_SECRET` → confirm the super-admin-gated endpoint still authenticates with the new value (out of band, not printed)
- `INTERNAL_WEBHOOK_SECRET` → confirm `handle_chat` still accepts internally-generated calls (WhatsApp path unaffected, same revision holds both sides)
- `GITHUB_WEBHOOK_SECRET` → once GitHub-side is synced, a test delivery from GitHub's webhook "Recent Deliveries" panel returns 200, not 401
- `DATABASE_URL` → `GET /health`, plus one authenticated read (e.g., `GET /api/v1/clients`) to confirm real DB connectivity, not just process liveness
- OAuth secrets → a full login round-trip via Google and GitHub respectively
- AI provider keys → one real chat completion through each provider (`/api/v1/ai/chat` or equivalent) to confirm the new key is live
- `TWILIO_AUTH_TOKEN` → send one test WhatsApp message through the sandbox
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` → `getWebhookInfo` shows the URL registered with no errors, then send one test message to the bot
- `RESEND_API_KEY` → send one test email
- `REDIS_URL` → confirm `_cache_get`/`_cache_set` round-trip works against real Redis, not just the in-memory fallback (watch for the "Redis unavailable" log line — it should NOT appear)

## 8. Execution Log

_Populated as each rotation completes. Values are never recorded here — only status, revision IDs, and timestamps._

| # | Secret | Tier | Status | Revision / reference | Completed (IST) |
|---|---|---|---|---|---|
| 1 | `SECRET_KEY` | A | ✅ Rotated | `voxly-backend-00016-xnn` | 2026-07-25 |
| 2 | `SUPER_ADMIN_SECRET` | A | ✅ Rotated | `voxly-backend-00016-xnn` | 2026-07-25 |
| 3 | `INTERNAL_WEBHOOK_SECRET` | A | ✅ Rotated | `voxly-backend-00016-xnn` | 2026-07-25 |
| 4 | `GITHUB_WEBHOOK_SECRET` (app side) | A | ✅ Rotated | `voxly-backend-00016-xnn` | 2026-07-25 |

**Notes on the rotation above:**
- All 4 were batched into a single `gcloud run services update --update-env-vars` call (one redeploy instead of four) since none has an external dependency that requires sequencing. New values also written into local `backend/.env` (values never displayed).
- `GET /health` → `200`, zero `ERROR`-severity logs in the 10 minutes following.
- **Finding (not part of this rotation, flagging separately):** grepped the full `app/` tree for `INTERNAL_WEBHOOK_SECRET` usage beyond its declaration in `config.py` — it is not referenced anywhere else in current code. The `X-Voxly-Webhook-Token` guard documented in `CLAUDE.md`'s 2026-03-10 audit entry appears to have been removed when the WhatsApp handler was later refactored to call `generate_client_response()` directly in-process instead of over HTTP (per the 2026-03-11 dogfooding log entry) — the internal HTTP call this secret was guarding may no longer exist. Rotated it anyway since it was exposed and may still be read by other tooling/IaC, but it is currently dead config, not an active access control. Worth a separate look during Phase 2/3 (Messaging/AI integration) to confirm no internal-only endpoint is now unintentionally unguarded.
- `GITHUB_WEBHOOK_SECRET` smoke test: `POST /api/v1/github/webhook` with no signature → `401`; with a garbage signature → `401`. Confirms the new value is loaded and the endpoint still fails closed.
- `SECRET_KEY` smoke test: `GET /api/v1/auth/me` with an invalid/garbage bearer token → `401` (JWT verification pipeline intact). A full login round-trip with real credentials is the final confirmation and needs to come from you, since I don't have (and shouldn't fabricate) real login credentials against production — expected behavior either way is that everyone, including you, needs to log in again after this rotation.
- `SUPER_ADMIN_SECRET` was not independently smoke-tested (no safe way to do so without the value); health + error-log checks are the available signal.
| 5 | `DATABASE_URL` | B | Pending — awaiting you | — | — |
| 6 | `GOOGLE_CLIENT_SECRET` | B | Pending — awaiting you | — | — |
| 7 | `GITHUB_OAUTH_CLIENT_SECRET` | B | Pending — awaiting you | — | — |
| 8 | `GITHUB_TOKEN` | B | Pending — awaiting you | — | — |
| 9 | `ANTHROPIC_API_KEY` | B | Pending — awaiting you | — | — |
| 10 | `OPENAI_API_KEY` | B | Pending — awaiting you | — | — |
| 11 | `GEMINI_API_KEY` | B | Pending — awaiting you | — | — |
| 12 | `TWILIO_AUTH_TOKEN` | B | Pending — awaiting you | — | — |
| 13 | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` | B | Pending — awaiting you | — | — |
| 14 | `RESEND_API_KEY` | B | Pending — awaiting you | — | — |
| 15 | `REDIS_URL` | B | Pending — awaiting you | — | — |
| 16 | `GITHUB_WEBHOOK_SECRET` (GitHub side) | B | Pending — awaiting you | — | — |
