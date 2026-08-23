# Stabilization Report — v1.0.0-beta

**Date:** 2026-07-26
**Scope:** Post-deployment verification following the P0-1 account-deletion fix.
**Deployed commit:** `ca8ebec` (tag `v1.0.0-beta`) — PR #111, merged into `main`.
**Cloud Run revision:** `voxly-backend-00019-zz8` (serving 100% traffic).
**Production DB migration:** `5b8e3c1f9a2d` (unique constraint on `organizations.owner_user_id`).

No new feature work was performed. No code was modified beyond what PR #111 already
contained. Two production actions were taken during this pass, both disclosed in full below:
running the pending migration, and deploying `main` — plus one corrective action to a
self-inflicted regression (§3).

---

## 0. Deployment-state correction (read this first)

The instruction that started this pass stated the account-deletion work "has been deployed
successfully." That was checked against Git and Cloud Run directly, not assumed:

| Claim | Actual state found |
|---|---|
| Merged to `main` | ✅ True — PR #111 merged at `2026-07-26T12:28:01Z` |
| Deployed to Cloud Run | ❌ **False** — live revision was still `voxly-backend-00017-llb`, created `07:52:27Z`, hours *before* the merge. No CI/CD auto-deploys Cloud Run on merge. |
| Migration applied to production DB | ❌ **False** — `alembic_version` was one revision behind |

With approval, both gaps were closed this session (§1). Everything below reflects the system
**after** that deploy, not before.

## 1. Actions taken this session

1. Confirmed the locally-checked-out backend tree was byte-identical to `origin/main` before
   deploying (`git diff 704a08f origin/main -- backend/` — empty).
2. Applied migration `5b8e3c1f9a2d` to the production database directly (`alembic upgrade head`).
   Verified before applying: 15 organizations, zero `owner_user_id` duplicates — safe.
3. Deployed `main` to Cloud Run: `gcloud run deploy voxly-backend --source . --env-vars-file=env.yaml`
   → new revision `voxly-backend-00018-fgz`, confirmed healthy and serving 100% traffic.
4. Ran a full live E2E smoke test against production with a disposable account (§2).
5. **Found and fixed a self-inflicted regression** (§3).
6. Tagged the deployed commit `v1.0.0-beta` and pushed it — the rollback point for this release.

## 2. Verified workflows (live, against production, this session)

All of the following were exercised with real HTTP/WebSocket calls against
`https://voxly-backend-703348211297.us-central1.run.app` using disposable accounts, all of
which were cleaned up (deleted) at the end of each test:

| Workflow | Result | Evidence |
|---|---|---|
| Register | ✅ | `201`, real account created |
| Login | ✅ | `200`, real JWT issued |
| `GET /auth/me` | ✅ | `200`, correct identity returned |
| Create Client | ✅ | `201` |
| Create Project (with and without `github_repo`) | ✅ | `201` both cases; `github_stats` correctly `null` when no sync has run (no fabricated data) |
| Create Milestone | ✅ | `201` |
| WhatsApp inbound message | ✅ | Simulated via a **real, correctly Twilio-signed** webhook POST (`RequestValidator.compute_signature` with the real `TWILIO_AUTH_TOKEN`) — not a bypass. Accepted `200` |
| AI response generated | ✅ | Real AI reply returned and persisted, visible in Conversation Center and chat history |
| Conversation Center (`GET /chat/conversations`) | ✅ | `200`, conversation with real `last_message`/`last_response` present |
| Chat history (`GET /chat/history/{client_id}`) | ✅ | `200`, inbound + AI reply both present |
| WebSocket connect + live update | ✅ | Connected to `wss://.../api/v1/chat/ws`, received real `conversation.message_received` and `conversation.message_completed` broadcast events live, in real time, triggered by the webhook call above |
| Channels (`GET /channels`) | ✅ | `200` |
| Dashboard (`GET /dashboard/stats`) | ✅ | `200` |
| Cross-tenant isolation | ✅ | A second disposable account correctly saw 0 of the first account's clients |
| **Delete account — Layer 1** (org exists, no data under it) | ✅ | `204`. This is the exact original bug repro. |
| **Delete account — Layer 2** (org with real client + project, `org_id` populated on both) | ✅ | `204`. Confirmed via direct query: `client.org_id` and `project.org_id` were both non-null before deletion; `users`/`clients`/`projects`/`organizations` row counts all `0` after. |
| Token rejected after deletion | ✅ | `401` on the now-deleted account's old token |
| Email reusable after deletion | ✅ | Re-registering with the same email succeeded (`201`) — proves the deletion is a real hard delete, not a lingering unique-constraint block |
| Full dependency-graph cleanup (direct DB query, not just HTTP response) | ✅ | Zero rows in `users`, `clients`, `projects`, `milestones`, `chat_history`, `conversation_states`, `api_keys`, `user_ai_keys`, `subscriptions`, `usage_logs`, `organizations`, `memberships` for the deleted test user |

### Not tested this session (disclosed, not silently skipped)

- **Google OAuth / GitHub OAuth** — require an interactive browser consent flow; not verifiable
  via API-only automation. Recommend a manual click-through before relying on this report as
  complete OAuth coverage.
- **Telegram** — not exercised (no test bot session available in this pass).
- **Real GitHub webhook / sync** — not exercised (would require a real repo push).
- **Billing (Stripe/Razorpay checkout)** — not exercised (would create real payment-provider
  state).
- **Frontend UI click-through** (Settings, AI Agents, Analytics pages) — this session verified
  the backend API surface only, via direct HTTP/WebSocket calls, not a browser.

## 3. Failed workflows

**None of the workflows listed in §2 failed.** One real problem was found and fixed, but it was
caused by this session's own deployment step, not a defect in the shipped code:

**Self-inflicted: `DUAL_WRITE_ORGANIZATIONS_ENABLED` silently reverted to `false`.**
`gcloud run deploy --env-vars-file=env.yaml` replaces the *entire* environment variable set on
the Cloud Run service rather than merging with it. The previous revision had
`DUAL_WRITE_ORGANIZATIONS_ENABLED=true` set directly on the service, outside the repo's
`env.yaml` (this is very likely why the original audit could only confirm the flag was live via
*reproduction*, never from a checked-in source — there wasn't one). Since `env.yaml` didn't
include that key, the first deploy (`00018-fgz`) silently dropped it back to the code default of
`false`. For the window between that deploy and the fix below, new registrations were not
getting an `Organization`/`Membership` row — reintroducing exactly the "two classes of users"
split the account-deletion design doc's §4 said was worse than either committed state.

- **Detected:** by registering a fresh test account immediately after deploy and checking
  directly whether an `Organization` row was created — it wasn't.
- **Fixed:** with explicit approval, `gcloud run services update --update-env-vars
  DUAL_WRITE_ORGANIZATIONS_ENABLED=true` (merge-style, not another full replace) → revision
  `voxly-backend-00019-zz8`. Verified: env var key sets on `00017-llb` (before) and `00019-zz8`
  (now) are identical; a fresh registration after the fix correctly created an `Organization` row;
  the Layer-1 and Layer-2 deletion tests in §2 were re-run *after* this fix specifically to prove
  the org-deletion code path was genuinely exercised live, not skipped.
- **Prevented from recurring:** added `DUAL_WRITE_ORGANIZATIONS_ENABLED: "true"` to
  `backend/env.yaml` locally (gitignored, not committed — matches how every other secret in that
  file is handled) so the next `--env-vars-file` deploy won't drop it again.
- **Window of exposure:** roughly `12:56:24Z` to `13:0x:xxZ` (well under 15 minutes). Checked
  Cloud Run logs for any real (non-test) registrations in that window — none found.

This is now folded into §4 as a new P1, since the underlying process gap (a production-affecting
flag whose only source of truth is a manual `gcloud` command, invisible to git) is exactly the
kind of thing that caused it and will cause it again on the next `--env-vars-file` deploy by
anyone who doesn't happen to check for this.

## 4. Remaining P1 issues

Unchanged from `PRODUCTION_READINESS_AUDIT.md` except where noted. None of these were in scope
for the P0-1 fix and none were touched this session:

1. **Frontend doesn't consume the Phase 3 / Channels backend endpoints it was built to use.**
2. **No inbound message throttling on WhatsApp/Telegram.**
3. **Telegram webhook fails open if its secret is unset.**
4. **HSTS header not actually reaching clients in production.**
5. **Several sensitive endpoints have no rate limiting.**
6. **Password-reset token reusable within its 15-minute window, and silent email failure.**
7. **Missing indexes on hot query columns** (`chat_history.created_at`, `conversation_states.status`).
8. **NEW — production feature flags have no source of truth in version control.**
   `DUAL_WRITE_ORGANIZATIONS_ENABLED` lives only as a value set directly on the Cloud Run
   service via an untracked `gcloud` command; `env.yaml` (itself gitignored) is the closest thing
   to a record and it was out of sync until this session. Any future `--env-vars-file` deploy by
   anyone unaware of this will silently revert it again. Recommend either (a) a checked-in
   `env.yaml.example`/deployment doc listing every flag that must be present, checked as part of
   the deploy step, or (b) moving these flags into Secret Manager / a config source that's
   diffed automatically rather than trusted from memory.

## 5. Remaining P2 issues

Unchanged from `PRODUCTION_READINESS_AUDIT.md`:

1. Organizations/Roles/Memberships/Invitations have zero API surface (dead RBAC layer).
2. *(Superseded — was "undocumented tenancy flag drift," now promoted to P1-8 above since this
   session proved it's not just undocumented, it's actively fragile.)*
3. No structured (JSON) logging; no request-correlation ID beyond Cloud Run's trace header.
4. No global FastAPI exception handler.
5. GitHub sync has no explicit API rate-limit/backoff handling.
6. SQLAlchemy connection pool uses unexamined library defaults.
7. WebSocket manager is in-process only, no cross-instance pub/sub.
8. `.env.example` ships `DEBUG=true` (confirmed not the real production value).
9. `INTERNAL_WEBHOOK_SECRET` is dead config (the endpoint it guarded was refactored away).

## 6. Performance observations

- **Cloud Run logs, `voxly-backend-00018-fgz`/`00019-zz8`, from deploy through end of this
  session: zero 5xx responses, zero unexpected `ERROR`-severity log entries.** The only `ERROR`
  found in this window predates the fix deploy (`11:13:04Z`, `voxly-backend-00017-llb`) and is
  the P0-1 bug itself, hit by real traffic before the fix — direct evidence of real-world impact,
  not a new issue.
- **Request latency during this session's test traffic was elevated** (register 3–9s,
  `DELETE /me` 3–5.6s, client/project creation 2–5s) **but this window is confounded by two
  consecutive fresh deploys** — almost every request landed on a cold-started instance. This is
  not a clean read on steady-state performance. `pg_stat_statements` was checked directly and
  shows **no slow application queries** in the top-15-by-mean-time (dominated by Supabase's own
  internal/introspection queries and this session's own one-off `ALTER TABLE`) — the elevated
  latency is consistent with cold start, not slow SQL, but this should be re-checked once the
  service has been running warm for a while, ideally during the still-outstanding 24h
  observation window (§8).
- No slow-query or lock-contention signal found in `pg_stat_activity` (1 active connection at
  time of check, consistent with current low traffic).

## 7. Security observations

No new findings. Spot-checked as part of this pass, all still correct:

- Twilio webhook signature verification is genuinely enforced — the WhatsApp test in §2 only
  succeeded because a real signature was computed with the real auth token; an unsigned or
  incorrectly-signed request would have been rejected `401` (not tested to failure this session,
  but the code path and the auth-token requirement were both directly exercised).
- Cross-tenant isolation confirmed live (§2) — a second account saw zero of the first account's
  data.
- The account-deletion rewrite itself introduces no new security surface: it operates only on
  `current_user`'s own rows, the 409 guard fails closed (nothing deleted) rather than failing
  open, and the row lock (§15.3 of `ACCOUNT_DELETION_DESIGN.md`) closes a real concurrency gap
  rather than opening one.
- The env-var incident in §3 was a configuration-drift risk, not a security exposure — no
  secrets were affected (`env.yaml`'s other 24 keys were already correct; only the one
  non-secret feature flag was missing from it).

## 8. What's still outstanding from the original stabilization request

- **24-hour production observation window**: not fulfilled — this session can verify
  point-in-time state (done, repeatedly, above) but cannot literally wait 24 hours. What *is*
  covered: the deploy is healthy, zero errors/5xx in the period checked, and the one real issue
  that surfaced (§3) was caught within minutes precisely because this pass was actively watching
  right after deploy. Recommend an explicit follow-up check in ~24h (Cloud Run error rate,
  WebSocket disconnect rate, DB connection count) rather than treating this report as satisfying
  that gate.
- **Google/GitHub OAuth, Telegram, billing flows**: not exercised this session (§2) — recommend
  a manual pass before calling this release fully verified end to end.

## 9. Recommended next milestone

**Same conclusion as the original audit, now with one addition.** Resolve the multi-tenancy
Phase 1 ambiguity — commit fully to org-based tenancy (the account-deletion design doc already
made this call; today's flag-drift incident is a second, independent argument for the same
conclusion) and finish the read-path cutover before P1-1 (frontend/backend wiring). Add to that
milestone's scope, cheaply, since it's now a proven live risk rather than a theoretical one:
**give `DUAL_WRITE_ORGANIZATIONS_ENABLED` (and any other production-only flag) a real source of
truth** (P1-8) — this is small, fast, and directly prevents a repeat of §3 the next time anyone
deploys this service.

Do not start P1-1 or any new feature work until that decision is made — everything else in this
report and the original audit still assumes a settled answer to "does a client/project belong to
a user or an organization," and today's incident is a live demonstration of what happens when
that answer is allowed to drift silently.

---

**No new feature work was performed. Waiting for approval before any further implementation.**
