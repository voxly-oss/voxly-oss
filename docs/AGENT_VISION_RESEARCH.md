# Voxly Agent Vision — Research & Architecture

> Status: **Research / proposal**. No code changes implied by this document.
> Author: engineering. Date: 2026-07-19.
>
> This responds to the vision: *"Voxly's agent should be multilingual and smart
> enough to handle clients, win clients, and manage them — able to raise PRs,
> read screenshots, read audio, act as a full-stack developer / CEO / solo
> entrepreneur. Maybe an agent team (PR, bug, issues, client queries). When a
> client says 'I want this instead of that', the agent first checks whether the
> goal is feasible against the codebase, tries to handle it itself, and either
> ships a PR or notifies/proposes to the developer."*

---

## 1. The vision, restated in one line

**Turn Voxly from a "status-answering chatbot" into an autonomous delivery
teammate** that sits between the client and the codebase: it understands a
client's intent (in any language, from text/voice/screenshot), decides whether
it can act, and then either **does the work (opens a PR)**, **proposes the work
(drafts a plan for a human)**, or **answers directly** — always leaving a human
in control of anything irreversible.

---

## 2. Where Voxly is today (grounded inventory)

| Capability | Status today | File / evidence |
|---|---|---|
| Reason→act loop | ✅ ReAct, 5-step cap | `services/ai_agent.py` `VoxlyAgent.chat` |
| Multi-provider + fallback | ✅ Claude → OpenAI → Gemini | `services/ai_service.py`, `ai_providers/__init__.py` |
| Multilingual | ✅ (prompt-level language mirroring) | `ai_agent.py` system prompt rule #1 |
| Screenshot / image reading | ✅ vision blocks (Claude/OpenAI) | `ai_agent.py` `_build_image_block` |
| GitHub: read issues/files | ✅ | `tools/github_tools.py` |
| GitHub: **create issue** | ✅ | `GitHubCreateIssueTool` |
| GitHub: **raise PR / commit** | ❌ not built | — |
| Audio / voice-note reading | ❌ not built | (WhatsApp sends `MediaUrl`; not transcribed) |
| Writing code | ❌ not built | — |
| Feasibility / triage step | ❌ not built | — |
| Escalate-to-human workflow | ⚠️ partial (can file an issue) | — |
| Multi-agent team | ❌ single agent | — |
| Sales / "win clients" | ❌ not built | — |
| Per-tenant knowledge/memory | ⚠️ `LocalDocsTool` only, static | `tools/kb_tools.py` |

**Takeaway:** the *conversational* and *perception* layers (multilingual,
vision, multi-provider) are largely done. The gap is the **action layer**
(writing code, raising PRs) and the **judgment layer** (feasibility triage,
self-handle vs. escalate). Those are the hard, high-risk parts — and where the
design effort belongs.

---

## 3. Core architectural decision: one agent or a team?

Your instinct ("maybe an agent team: PR, bug, issues, client-query") is right in
spirit but the wrong first step. The tradeoff:

- **True multi-agent** (separate autonomous agents messaging each other) is
  harder to debug, more expensive (each agent re-loads context), and prone to
  loops. It shines only once each role is individually proven.
- **Single orchestrator + specialist "skills/sub-tasks"** gives you 90% of the
  benefit now: one router agent that classifies intent and dispatches to a
  focused tool-set (or a short-lived sub-agent) for that job.

**Recommendation:** Build **one orchestrator ("Voxly PM")** that triages every
inbound message, plus a small set of **specialist workers it can invoke as
sub-tasks** (not always-on peers):

```
                    ┌─────────────────────────────┐
   client msg  ───► │   Voxly PM (orchestrator)    │
 (text/img/audio)   │   - normalize input          │
                    │   - detect language          │
                    │   - classify intent          │
                    │   - decide: answer/act/escalate
                    └───────┬───────────┬──────────┘
                            │           │
              ┌─────────────┘           └──────────────┐
              ▼                                          ▼
   ┌──────────────────┐                      ┌────────────────────┐
   │  Client-Care      │                      │  Dev-Delivery       │
   │  (answer, clarify,│                      │  (feasibility check,│
   │   status, upsell) │                      │   code, open PR)    │
   └──────────────────┘                      └────────────────────┘
                            │
                            ▼
                 ┌────────────────────┐
                 │  Escalation / Human │  (notify dev, draft proposal,
                 │  (Slack/WhatsApp)   │   file issue, request approval)
                 └────────────────────┘
```

Graduate a specialist to a *real* standalone agent only after it's reliable as a
sub-task. This matches Voxly's existing "expand → prove → contract" discipline.

---

## 4. The heart of the request: the "client wants a change" loop

This is the workflow you described most precisely. It deserves to be a
first-class, explicit state machine — **not** an implicit prompt behavior,
because each transition has a different risk/cost profile.

```
   ┌────────────┐   ┌──────────────┐   ┌───────────────┐   ┌──────────────┐
   │ 1. CAPTURE │──►│ 2. UNDERSTAND│──►│ 3. FEASIBILITY│──►│ 4. DECIDE    │
   │ multimodal │   │ intent+scope │   │ vs. codebase  │   │ route        │
   └────────────┘   └──────────────┘   └───────────────┘   └──────┬───────┘
                                                                   │
        ┌──────────────────────────┬─────────────────────────────┤
        ▼                          ▼                              ▼
  (A) ANSWER               (B) SELF-SERVE                  (C) ESCALATE
  no change needed;        agent can safely make           needs human: too big,
  clarify or inform.       the change → open a              risky, ambiguous, or
                           **draft PR** for review.         product decision.
```

### Step-by-step

1. **Capture (multimodal intake).** Text, voice note (→ transcribe), screenshot
   (→ vision describe + OCR). Normalize to a structured "request object":
   `{client, project, raw_text, language, attachments[], detected_intent}`.

2. **Understand (intent + scope).** Classify: *status question? bug report?
   change request? new feature? complaint? sales/expansion signal?* Extract the
   concrete ask ("make the banner blue" → which element, which page, hex value?).
   Reuse the existing "Clarifier" prompt rule — but make clarification a loop
   that can pause and ask the client before acting.

3. **Feasibility check (against the actual codebase).** This is the step you
   emphasized ("agent first checks the goal / codebase — possible or not").
   The agent:
   - locates the relevant files (semantic search over the repo),
   - estimates blast radius (1 file vs. 40),
   - checks for obvious blockers (does the feature exist? is it a config change
     or an architectural one?),
   - produces a **confidence score + effort estimate**.

4. **Decide (route).** A policy — not vibes — chooses A/B/C based on
   `confidence`, `blast_radius`, `reversibility`, and `tenant risk settings`:
   - **A. Answer** — informational or "already works this way."
   - **B. Self-serve → draft PR** — high confidence, small blast radius,
     reversible, and within an allowlisted change class (copy, styling, config,
     small bug fix). The agent branches, edits, runs tests, opens a **Draft PR**,
     and notifies the human. *It never merges.*
   - **C. Escalate** — low confidence, large/irreversible, or a product/pricing
     decision. The agent writes a crisp proposal ("client wants X; here's what it
     touches; here are 2 options; recommend Y") and pings the developer.

**Critical principle:** self-serve produces a **Draft PR + notification**, not a
merge. "Agent tries to handle it itself" = *agent prepares the change and asks a
human to press the button*, at least until trust is earned per change-class.

---

## 5. Closing the capability gaps

### 5.1 Multilingual — ~80% done, make it robust
Today it's a prompt instruction. Harden it: detect language explicitly at intake
(store `detected_language` on the request), keep a per-client language
preference, and localize the *canned* strings (welcome message, error fallback,
escalation notices) which are currently English-only in `notification_service`.

### 5.2 Screenshot reading — done, extend to OCR-heavy cases
Vision blocks already work. For dense UI screenshots or error logs, add an OCR
pass (the model reads text fine, but for pixel-precise coordinates/hex a
dedicated step helps). Feasible now with existing providers.

### 5.3 Audio / voice notes — new, low-risk, high-value
WhatsApp/Telegram voice notes arrive as a media URL. Add a **transcription tool**
(OpenAI `gpt-4o-transcribe`/Whisper, or Gemini audio) → feed the transcript into
the same pipeline. This is a self-contained, safe add — good early win.

### 5.4 Raising PRs — the pivotal new capability
Requires GitHub **write** scope and new tools:
- `create_branch`, `put_file` (commit), `open_pull_request` (as **draft**),
  `comment_on_pr`. Build on the existing `PyGithub` service.
- **Guardrails baked in:** only branch off, never force-push; only touch files
  within an allowlisted path scope; always open as *draft*; PR body auto-includes
  the client request, the diff summary, and "generated by Voxly — review before
  merge." Hard limits on files-changed and lines-changed per PR.

### 5.5 Writing code — the genuinely hard one; scope it down
"Full-stack developer agent" is the most over-promised capability in the whole
industry. Be honest about tiers:
- **Tier 0 (now):** file an issue / write a spec. Zero risk. ✅ mostly exists.
- **Tier 1 (near):** *bounded* edits — copy changes, config flags, CSS/styling,
  string/i18n, simple isolated bug fixes — in a sandboxed checkout, gated by
  tests + draft PR. High value, controllable risk.
- **Tier 2 (later):** multi-file features behind a spec the human approved first.
  Needs a real sandboxed build/test loop (ephemeral container, run the repo's
  test suite, iterate). This is where cost and flakiness spike.
- **Tier 3 (aspirational):** autonomous architecture decisions. Keep this
  human-led for the foreseeable future.

Start at Tier 1. Don't let the demo of Tier 3 set the roadmap.

### 5.6 "Win clients" / sales — separate track, separate risk profile
Autonomously *selling* is reputationally risky (an agent making commitments or
pricing offers on your behalf). Realistic near-term version: the orchestrator
**detects expansion/upsell signals** ("can you also build X?") and drafts a
proposal/quote **for you to send**, plus lead-qualification summaries. Keep the
human as the closer.

### 5.7 Per-tenant memory
The self-serve loop needs durable context: past decisions, this client's
preferences, the project's conventions. Today `LocalDocsTool` is static. Plan a
per-tenant knowledge store (the roadmap already references pgvector) so the agent
"remembers" what was decided and how this codebase likes to do things.

---

## 6. Safety, trust & guardrails (non-negotiable)

Because this agent acts on **client communications** and **client code**, the
guardrails *are* the product:

1. **Draft, never merge.** No autonomous merges or deploys. Ever (initially).
2. **Change-class allowlist.** Self-serve only within explicitly safe classes;
   everything else escalates.
3. **Blast-radius caps.** Max files/lines per autonomous PR; exceed → escalate.
4. **Human approval for outbound commitments.** No pricing, deadlines, or scope
   promises to clients without human sign-off.
5. **Full audit trail.** Every action (message → decision → PR/notification)
   logged and attributable, per tenant. Reuse the metrics pattern from
   `tenant_metrics`.
6. **Tenant-configurable autonomy.** Each agency sets how much the agent may do
   on its own (from "answer only" → "draft PRs for styling" → "…").
7. **Kill switch + rate limits.** Per-tenant feature flags (Voxly already uses
   this pattern) and cost ceilings.
8. **Cost governance.** Tier-2 code loops can be expensive; cap spend per
   request and per tenant; prefer cheaper models for triage, escalate to Claude
   for the hard reasoning.

---

## 7. Proposed phased roadmap (incremental, deployable)

Each phase is independently shippable and behind a flag — consistent with how
Voxly already rolls out change.

- **Phase 0 — Foundations (perception + memory).**
  Voice-note transcription tool; explicit language detection; localize canned
  strings; stand up per-tenant memory (pgvector). *Low risk, immediate value.*

- **Phase 1 — Triage brain (judgment, no new actions).**
  Introduce the request-object + intent classifier + the A/B/C decision policy,
  but wire only **A (answer)** and **C (escalate: notify/file issue/draft
  proposal)**. No code-writing yet. This alone makes Voxly feel like a PM.

- **Phase 2 — Feasibility read.**
  Add repo semantic search + feasibility scoring. Agent can now *tell you*
  "possible / not / here's what it touches" without changing anything.

- **Phase 3 — Self-serve Tier 1 (draft PRs).**
  GitHub write tools; sandboxed checkout; bounded change-classes; tests + draft
  PR + notification. The full loop lands, safely.

- **Phase 4 — Specialist workers + Tier 2.**
  Graduate bug-fix / feature-spec specialists; sandboxed build-test-iterate for
  multi-file changes behind approved specs.

- **Phase 5 — Growth signals (sales assist).**
  Upsell/lead detection → drafted proposals for human send.

---

## 8. Cost & model strategy

- **Triage/classify** with a cheap, fast model (Gemini Flash when funded, or
  Haiku); **reserve Claude Sonnet/Opus** for feasibility reasoning and code.
- Cache repo embeddings per project; don't re-embed on every message.
- Put a hard per-request token/§ ceiling in the orchestrator; Tier-2 loops must
  respect a max-iterations and max-cost budget.

---

## 9. Honest risk assessment

| Ambition | Realistic near-term | Why |
|---|---|---|
| "Full-stack dev agent" | Tier-1 bounded edits → draft PR | Reliability + safety; Tier-2/3 are research-grade |
| "Win clients" autonomously | Detect signals, draft proposals | Reputational/legal risk of autonomous commitments |
| "Acts as CEO" | Prioritization + summaries for *you* | Judgment calls stay human until trust is earned |
| "Agent team" | Orchestrator + on-demand specialists | True multi-agent adds cost/instability too early |
| Multilingual, vision, audio | ✅ Fully achievable now | Perception is a solved problem here |

**The through-line:** the perception and conversation pieces are ready. The
value — and the risk — is in the **act/judge** layer. Build it as an explicit,
audited, human-gated state machine, tier by tier. Ship the safe wins (voice,
triage, feasibility read, draft PRs) before chasing autonomous engineering.

---

## 10. Decisions this needs from you

1. **Autonomy ceiling:** for the first self-serve version, is "draft PR, human
   merges" acceptable — or do you want eventual auto-merge for trivial classes?
2. **First slice:** start with **Phase 0 (voice notes)** for a fast visible win,
   or jump to **Phase 1 (triage brain)** to reshape the agent's behavior first?
3. **Sales in scope now, or later?** (Recommend later — after delivery loop is
   proven.)
