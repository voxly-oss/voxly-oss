# Frontend v3 Deployment Plan

**Date:** 2026-07-26
**Scope:** Review, clean up, and verify production-readiness of the uncommitted "v3 AI Work OS" frontend redesign (50 changed files: 12 modified, 38 new) against the backend that was deployed earlier today (revision `voxly-backend-00017-llb`, Phase 2 Milestone 3 + Phase 3 Milestones 1–5).
**Backend code:** Not touched this session, per instruction.
**State:** All changes below are made but **uncommitted**. Nothing has been pushed or deployed to Vercel. Waiting for approval before either step.

---

## 1. What changed in this session

### 1.1 Fixed — ESLint errors (13 → 0, repo-wide)

`npm run lint` was failing (13 errors). All fixed; `npm run lint` now exits clean (0 errors, 66 pre-existing warnings, none introduced by this session). `npm run typecheck` was already clean and still is. `npm run build` (Turbopack production build) succeeds — all 32 routes compile.

| File | Fix |
|---|---|
| `app/chat/page.tsx` | Escaped unescaped quotes (`react/no-unescaped-entities`) |
| `app/docs/page.tsx` | Escaped unescaped quotes |
| `app/voxly-admin/page.tsx` | Escaped unescaped apostrophe |
| `components/FeatureVisuals.tsx` | Escaped unescaped quotes/apostrophe |
| `components/HeroVisualPipeline.tsx` | Escaped unescaped quotes |
| `hooks/useWebSocket.ts` | Fixed real "used before declared" hook error (see 1.3) |

These 5 files are pre-existing (not part of the v3 diff) but were fixed because they were the reason `npm run lint` failed as a whole — leaving them broken while calling lint "passing" wasn't defensible.

### 1.2 Fixed — dead code in the v3 file set

Unused imports/vars removed (all confirmed unused via lint + a grep double-check, not just the lint list):

- `app/dashboard/page.tsx` — removed unused `Link`, `motion`, `FolderGit2`, `Radio`, `TrendingUp`, `Clock`
- `app/clients/page.tsx` — removed unused `formatDate` import
- `app/projects/page.tsx` — removed unused `formatDate` import
- `app/messages/page.tsx` — removed unused `Bot` import
- `app/channels/page.tsx` — removed unused `PanelText` import
- `app/clients/[id]/projects/[projectId]/milestones/page.tsx` — the `eslint-disable-next-line` comment was one line above where it needed to be (silencing nothing, while the real `any` two lines down went unsuppressed); moved it to the correct line

### 1.3 Fixed — broken realtime (WebSocket event-envelope mismatch)

**This was a real, verified functional regression, not a style issue.** Phase 3 Milestone 4 (deployed this morning) replaced the WebSocket message shape. The old shape was `{type: "new_message", message: {...}}`; the new one — confirmed by reading `backend/app/websockets/manager.py`'s `build_event()` and every `manager.broadcast(...)` call site in `messaging_core.py` — is:

```
{event: "conversation.message_received" | "conversation.message_completed" | "conversation.state_changed",
 timestamp, conversation_id, organization_id, payload: {...}}
```

`frontend/hooks/useWebSocket.ts` still typed messages as `{type, message}`, and `frontend/app/messages/page.tsx`'s live-update handler checked `lastMessage.type === 'new_message'` — a condition the new backend can never satisfy. **The WebSocket connects successfully (no visible error) but silently never delivers a live update**, on the exact page (Conversation Center) built to showcase Phase 3's realtime work.

Fixed:
- `useWebSocket.ts`: `WebSocketMessage` interface now matches the real envelope; also fixed the pre-existing "`connect` used before declared" lint error using a ref-forwarding pattern (`connectRef`) instead of leaving the reconnect `setTimeout` calling a not-yet-initialized `const`.
- `app/messages/page.tsx`: live-update handler now checks `lastMessage.event === 'conversation.message_completed'` and reads `lastMessage.payload` (which is a full `ChatMessage`-shaped record — `id`, `client_id`, `message`, `response`/`ai_response`, `model_used`, `tokens_used`, `channel`, `confidence`, `sentiment`, `language`, `ai_response_time_ms`, `created_at` — so the existing query-cache-append logic works unchanged once the event name matches).

This restores previously-working "new message appears live" behavior. It does **not** adopt the rest of Phase 3's new contract (real conversation status, real confidence/sentiment, `github_stats`) — see §2, this is deliberately scoped as a compatibility fix, not a feature adoption.

### 1.4 Fixed — false security/compliance/traction claims

Found while reviewing the settings pages: several **factual claims presented as current, verified truth** rather than illustrative design content. Treated as must-fix, separately from the broader mock-data question in §2, because these aren't "product vision" — they're specific, checkable assertions about the product's actual security posture and traction that a real prospect or customer could rely on.

| Location | Was | Fixed to |
|---|---|---|
| `app/(auth)/login/page.tsx` (public, unauthenticated) | "SOC 2 compliant · 256-bit encryption · 99.9% uptime" | "TLS encrypted · Bring your own AI keys" |
| `app/(auth)/register/page.tsx` (public, unauthenticated) | Stat tiles: "10K+ Agencies", "99.9% Uptime", "50M+ Messages Sent" | "Open source · MIT licensed", "BYOK · Your AI keys", "3 · Channels" (verified: MIT `LICENSE` file exists at repo root; 3 channels matches WhatsApp/Telegram/Email) |
| `settings/organization/page.tsx` | "Compliance: SOC 2 Type II", "Data encryption: AES-256", "Data region: US East (N. Virginia)" | Removed the false region claim (actual DB region is not US East); replaced the compliance panel with two claims that are actually true today (TLS in transit, BYOK keys encrypted at rest via Fernet) |
| `settings/security/page.tsx` | "Single sign-on (SSO): Enabled" (static, no toggle) · "Enforce 2FA... 6 of 8 members currently have 2FA enabled" · same false SOC 2/AES-256 panel | SSO now reads "Not available yet"; the 2FA/IP-allowlist/SSO toggles are now `disabled` (added a `disabled` prop to the shared `Toggle` component) with honest descriptions instead of fabricated adoption stats; webhook-signing toggle is `disabled`-checked since the backend enforces it unconditionally (not a real per-workspace switch) |
| `settings/general/page.tsx` | "Data region: US East" | Removed |

No other instances of `SOC 2`, `AES-256`, or `US East` remain in the frontend (re-grepped after fixing).

---

## 2. Compatibility with the newly-deployed backend — the important finding

I read the actual deployed backend code (not just the API contract docs) to check whether the v3 frontend consumes what Phase 2/3 shipped. **Mostly, it doesn't yet.** This is the single most important thing in this report.

### 2.1 `lib/api.ts` has zero client functions for four of the five Phase 3 endpoints

| Backend endpoint (live in production) | Frontend client (`lib/api.ts`) | Used anywhere? |
|---|---|---|
| `GET /api/v1/chat/conversations` (real status, search, pagination, `github_stats`) | **Missing** | No |
| `GET /api/v1/chat/conversations/{client_id}/status` | **Missing** | No |
| `PATCH /api/v1/chat/conversations/{client_id}/status` | **Missing** | No |
| `GET /api/v1/channels` (real per-client, per-channel `volume_today`/`last_activity`) | **Missing** | No |
| `GET /api/v1/chat/history/{client_id}` (now includes `github_stats`) | `chatAPI.clientHistory` exists | Not called anywhere in the v3 pages I reviewed |

### 2.2 Concrete consequence: Conversation Center (`app/messages/page.tsx`) still runs on the pre-Phase-3 data model

- Still calls the old flat `GET /chat/messages` and groups it into "conversations" client-side, instead of the new dedicated `/chat/conversations` endpoint.
- Still computes status with a **client-side heuristic**, `inferStatus()` (message age < 15 min → "AI handling", else "Resolved", no reply → "Awaiting human") — the exact kind of guess that Phase 3 Milestone 1 built `ConversationState` specifically to replace with a real, persisted, human-or-automatic status.
- Confidence and sentiment shown per conversation (`mockConfidence`/`mockSentiment`) are a **hash of the message ID**, not the real `ChatHistory.confidence`/`.sentiment` columns Phase 3 Milestone 2 added (and which the backend deliberately returns `null` for rather than fabricating, per the standing project rule).
- `github_stats` (Milestone 5) is never displayed.
- "Take over" / "Approve" buttons in the conversation detail view have no `onClick` — they render but do nothing; the real `PATCH .../status` endpoint that would back them isn't wired.

None of this is a regression from today's deploy — it's that the frontend redesign and the Phase 3 backend work were evidently built in parallel and never integrated. The realtime event-shape break (§1.3) is the one part of this gap that actually regressed (it used to work against the old event shape), and that's fixed.

### 2.3 `app/channels/page.tsx` doesn't use the `/api/v1/channels` endpoint Phase 2 Milestone 4 shipped

It calls `clientsAPI.list()` and fabricates health/volume/last-activity via a deterministic hash function per client+channel — including a fake "Email" row (`health`, `volume`, `last activity`, all `hashOf(...)`). This directly reintroduces the fabrication that Milestone 4 explicitly avoided by design: the real endpoint returns only WhatsApp/Telegram rows (email has no persisted conversation history to aggregate) with real `volume_today`/`last_activity` and **no health score at all**, because no metering/health model exists. The frontend page invents one anyway.

### 2.4 Recommendation

I did **not** rewrite these pages — wiring `/chat/conversations`, the status PATCH endpoint, and `/channels` into the UI is a real feature-integration effort (new API client functions, replacing `inferStatus()`, deciding what "Channels health" even means without a backend equivalent, wiring the take-over/approve buttons to a mutation), not a cleanup task, and it touches the two pages most central to the whole redesign. I'd suggest treating **"Phase 3 Frontend Integration"** as its own follow-up milestone, scoped explicitly to wiring the five endpoints above into Conversation Center and Channels. Happy to plan that next if you want it before or shortly after this deploy.

---

## 3. Known mock/illustrative content (full inventory)

Every instance below is disclosed in the source via a code comment (not visible to end users). Several explicitly reference having been built this way on instruction ("mock data / loading placeholders where the backend has nothing to serve" — `dashboard/page.tsx`), so I have **not** removed or rewritten any of it — only cataloged it here for your sign-off, since this app is being dogfooded on real client data and all four of these pages are wired directly into the primary sidebar nav (equal billing with Clients/Projects).

| Page | What's real | What's fabricated |
|---|---|---|
| `/agents` | Nothing — links out to the one real `/chat` interface | Entire "AI fleet" (3 agents), success rates, cost, latency, reasoning traces naming specific fake clients ("Studio Bloom", "Kessler & Vance", "Nomad Labs"), a "Ravin Kumar took over a conversation" event |
| `/automations` | Nothing | Entire workflow engine — 7 automations, run history, approval queue, failure timeline. Comment: "No automation/workflow engine exists on the backend yet" |
| `/analytics` | `active_clients`, `total_messages`, `ai_accuracy` (real, from `dashboardAPI.stats()`), `active_projects` (real count) | Revenue ($48.2K), churn-risk counts, all sparkline chart data, automation run stats, sentiment %, "Top Clients by Revenue" (names Fable Studio/Acme Co/Nomad Labs — none of which are guaranteed to be real client names in your data), "Cost by Agent". Real and fake numbers render in the same tiles with no visual distinction. |
| `/dashboard` | Client/project/message counts (real, `dashboardAPI.stats()`) | "Morning Briefing" section (priorities, blocker, suggestions), revenue tile, platform-uptime tile, token-spend/latency/queue panel |
| `/clients` (list) | All client fields | Per-client "Health" score and "MRR" — both `hashOf(client.id)`-derived, shown in the primary table and side panels of the main Clients page |
| `/projects` (list) | All project fields | Per-project "Health" score and assigned "Agent" (`mockAgent`, sometimes `null`) |
| `/clients/.../milestones` | Project/milestone data | Per-project "Health" score (same hash pattern) |
| `/messages` (Conversation Center) | Message content, `ai_response`, `model_used`, `tokens_used` | Status (heuristic, not the real field — see §2.2), confidence, sentiment |
| `/channels` | Which channels a client has (phone/email/telegram present) | Health, volume, last-activity for every row — see §2.3 |
| `/settings/team-members` | The "Owner" row (real authenticated user) | 6 named "teammates" with fake emails, roles, seen-times |
| `/settings/roles` | Nothing derived from data | 4 default roles + a 10-row permission matrix, presented as configured policy |
| `/settings/organization` | Owner identity, client/project counts | "Connected Services" GitHub/Voice status is inferred, not real integration state |
| `/settings/notifications`, `/settings/security` (policy toggles), `/settings/ai-defaults` (behavior toggles), `/settings/general` (timezone/date/language) | — | Controls render and respond to clicks but aren't persisted anywhere; state resets on refresh |

**Not flagged as a problem, just noting the pattern:** every one of these has an honest source comment. The gap was that the disclosure lived in code, not in the UI a real user sees.

### 3.1 Decision: visible "Preview" badges (implemented)

You chose option (b): ship everything, but make the illustrative content visually obvious to real users instead of only disclosed in source comments. Implemented as a new shared component, `components/PreviewBadge.tsx`, with three exports:

- **`PreviewBanner`** — a full-width callout (violet, matches the existing "Morning Briefing" visual language) placed at the top of pages that are entirely or almost-entirely illustrative: `/agents`, `/automations`, `/settings/team-members`, `/settings/roles`, and — since they're majority-mock — `/channels` and `/messages` (Conversation Center) each got a banner scoped to say precisely which part is real (e.g., "Which channels a client has is real. Volume, health, and last-activity... are illustrative").
- **`PreviewBadge`** — a small "Preview" pill, used on `Panel` side-panel titles that are entirely mock (e.g., "Health Distribution," "Top Clients by Revenue," "Cost by Agent," "Biggest Health Changes," "Conversation Health").
- **`PreviewMark`** — a compact icon-only marker (hover tooltip: "Preview — not backed by a real endpoint yet") for tight spaces like table column headers and stat-tile labels, where a full text pill doesn't fit — used on `/clients`, `/projects`, `/analytics`, `/dashboard`, `/messages`, and the project milestones page, attached only to the specific fabricated numbers (Health, MRR, Agent, Revenue, Platform Uptime, Automation Success, Confidence, Sentiment, SLA, Conversation Status, etc.) so the real numbers next to them (client/project/message counts) are left unmarked.

Two shared local `Panel`/`PanelRow` component definitions (duplicated per-file rather than imported from `components/SidePanel.tsx`, pre-existing before this session) needed a `badge`/wider-`label` prop added to accept the new markers — done in `app/clients/page.tsx`, `app/projects/page.tsx`, and `app/dashboard/page.tsx`.

**Verification:** `npm run typecheck` and `npm run lint` both still pass clean (0 errors) after this change, and a full `npm run build` succeeded (see §4).

**Not marked, by design:** the mock person names in `/settings/team-members` and role names in `/settings/roles` — the page-level `PreviewBanner` on both already covers the whole page, and marking every individual row would be noise. Real data (message content, client fields, project fields, real dashboard/analytics counts) was left untouched.

---

## 4. Verification results

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **Pass** — 0 errors |
| `npm run lint` (`eslint .`) | **Pass** — 0 errors, 66 warnings (all pre-existing `any`/unused-var style warnings outside the v3 file set; none introduced this session) |
| `npm run build` (production, Turbopack) | **Pass** — all 32 routes compile and prerender successfully (re-verified after the Preview-badge changes in §3.1) |
| Backend endpoint existence check | `authAPI.exportData()` → `GET /api/v1/auth/me/export` ✅ exists; `authAPI.deleteAccount()` → `DELETE /api/v1/auth/me` ✅ exists; `billingAPI.*` → all 6 backend routes in `billing.py` ✅ exist |
| `NEXT_PUBLIC_API_URL` (Vercel) | Already set to the Cloud Run backend URL from the earlier deployment session — no action needed |
| Destructive-action gating (`danger-zone/page.tsx`) | Reviewed — account deletion correctly requires typing "DELETE" before the button enables; real, working, appropriately gated |
| Manual browser testing | **Not done.** I did not start the dev server or click through the app in a browser this session — verification here is static (lint/typecheck/build/code-reading) only. Recommend a manual pass through Clients, Projects, Messages, and one Settings page before shipping, per the project's own standing UI-testing guidance. |

---

## 5. Files touched this session (fixes only, not the pre-existing v3 diff)

```
frontend/app/(auth)/login/page.tsx
frontend/app/(auth)/register/page.tsx
frontend/app/chat/page.tsx
frontend/app/dashboard/page.tsx
frontend/app/clients/page.tsx
frontend/app/projects/page.tsx
frontend/app/messages/page.tsx
frontend/app/channels/page.tsx
frontend/app/analytics/page.tsx
frontend/app/agents/page.tsx
frontend/app/automations/page.tsx
frontend/app/docs/page.tsx
frontend/app/voxly-admin/page.tsx
frontend/app/clients/[id]/projects/[projectId]/milestones/page.tsx
frontend/app/settings/organization/page.tsx
frontend/app/settings/security/page.tsx
frontend/app/settings/general/page.tsx
frontend/app/settings/team-members/page.tsx
frontend/app/settings/roles/page.tsx
frontend/components/FeatureVisuals.tsx
frontend/components/HeroVisualPipeline.tsx
frontend/components/SettingsRow.tsx
frontend/hooks/useWebSocket.ts
frontend/components/PreviewBadge.tsx   (new — PreviewBadge/PreviewBanner/PreviewMark)
```

Full diff stat for the entire v3 change (pre-existing + this session's fixes), for reference: **51 files changed** (12 modified files, 39 new files under `app/agents`, `app/analytics`, `app/automations`, `app/channels`, `app/settings/*`, and `components/*`, including the new `PreviewBadge.tsx`).

---

## 6. Rollback / risk if this ships

- **Reversibility:** Entirely local, uncommitted changes. Nothing pushed, nothing deployed. Reverting is `git checkout -- frontend/` (or simply not committing) — zero production impact either way, since the current production frontend at `voxly-oss.vercel.app` is untouched by anything in this session.
- **Backend risk:** None — no backend files were modified this session, consistent with instruction.
- **If deployed to Vercel as-is:** The build succeeds and the app functions. The risk is entirely the content question in §3 (real users seeing numbers that aren't real) plus the known gaps in §2 (Conversation Center and Channels not reflecting the new backend capabilities you just shipped and paid engineering time to build).

---

## 7. Status

- Lint, typecheck, and build are all green.
- Dead code removed from the v3 file set.
- One verified functional regression (realtime) fixed.
- False security/compliance/traction claims fixed everywhere I found them (settings pages + public login/register).
- Illustrative content now has visible "Preview" indicators in the UI (§3.1), per your decision.
- Nothing committed. Nothing pushed. Nothing deployed to Vercel.

**Waiting for your approval before committing or deploying**, per instruction. The one thing I'd still flag before you approve: §2 (Conversation Center and Channels not yet wired to the new Phase 3/Channels backend endpoints) is unresolved — not blocking, but worth a decision on whether it's a fast-follow or should happen first.
