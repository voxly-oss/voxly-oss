# Shadow-Read Verification Runbook

**Milestone 4 Step 1 bake period** — `ORGANIZATION_FIRST_ARCHITECTURE.md` §15.
This document governs the bake period only. It does not authorize Step 2
(read cutover) or any later step — those require a separate, explicit
approval after this bake period ends clean.

Status as of 2026-07-26T18:24Z: **bake period started.**

---

## 1. Feature flags enabled

Both flags live only as Cloud Run environment variables — they are **not**
read from any file committed to git. The local source of truth for
redeploys is the gitignored `backend/env.yaml`; it has been updated to
match production exactly as of this bake period starting. If you ever
redeploy with `gcloud run deploy --env-vars-file=env.yaml`, that command
**replaces** the full env var set — always diff `env.yaml` against the live
service first (`gcloud run services describe voxly-backend --format="value(spec.template.spec.containers[0].env)"`).
A prior incident this engagement (documented in `STABILIZATION_REPORT.md`
P1-8) silently dropped `DUAL_WRITE_ORGANIZATIONS_ENABLED` this exact way.

| Flag | Value | Since revision | Purpose |
|---|---|---|---|
| `DUAL_WRITE_ORGANIZATIONS_ENABLED` | `true` | `voxly-backend-00019-zz8` | Resolves/self-heals a personal `Organization` + `Membership` per user on request; dual-writes `org_id` on create paths. |
| `DUAL_READ_SHADOW_VERIFY_ENABLED` | `true` | `voxly-backend-00021-7kb` | Subject of this runbook. Compares legacy vs org-scoped read counts on every call to the 5 wired endpoints. |

Code deployed: commit `4810a8e` (`main`, PR #113) — includes the
shadow-verify wiring itself (`d4eda5a`). Verified merged to `main`,
verified as the actual running container image, not just merged to git —
`origin/main` was stale in the local checkout when this bake period began
and had to be re-fetched to confirm.

---

## 2. Expected behavior

On every request to these 5 endpoints, for a user whose tenant context
resolves (`DUAL_WRITE_ORGANIZATIONS_ENABLED=true` and self-heal succeeds):

- `GET /api/v1/clients`
- `GET /api/v1/projects`
- `GET /api/v1/milestones`
- `GET /api/v1/api-keys/`
- `GET /api/v1/ai-keys/`

`shadow_verify_read()` (`backend/app/utils/tenant_context.py:200`) runs one
extra read-only `COUNT` query scoped by `org_id`, compares it against the
existing legacy `user_id`-scoped count, and records the result in an
in-process counter. It:

- **Never changes the HTTP response.** Wrapped so no exception from the
  comparison itself can propagate — confirmed in the test suite
  (`test_shadow_verify_detects_a_real_mismatch` asserts the response is
  still 200 even when a mismatch is deliberately triggered).
- **Never fires for unresolved tenants** — if `tenant.resolved` is `False`
  or `org_id` is `None`, it returns immediately, no query issued.
- **Is the only new DB load** this bake period introduces: one extra
  `COUNT` per request to these 5 routes. No writes, no schema change.

A mismatch means: the set of rows this user's `user_id` legacy query
returns differs in count from what `org_id` alone would return — i.e. the
org-first migration's data (from self-heal + dual-write) has drifted from
the ground truth. That is exactly what this bake period exists to catch
*before* any endpoint is cut over to read from it.

---

## 3. Success criteria

- `shadow_read_mismatch_count` (see §5) stays at **zero** for the full bake
  duration, across a realistic volume of real (not synthetic) traffic on
  all 5 endpoints.
- No increase in error rate or p95/p99 latency on the 5 wired endpoints
  attributable to the added `COUNT` query, relative to the pre-`00021-7kb`
  baseline.
- No new `resolution_failure_count` growth beyond whatever baseline rate
  already existed under `DUAL_WRITE_ORGANIZATIONS_ENABLED` alone (that
  counter predates this flag and isn't itself a shadow-verify signal —
  don't conflate the two when reading logs).

## 4. Failure criteria

- **Any** `"Shadow read mismatch for ..."` log line — treat every single
  occurrence as worth investigating (§7), not just a rate threshold. At
  this stage the flag exists specifically to find the first one.
- A sustained latency or error-rate regression on the 5 endpoints that
  correlates with revision `voxly-backend-00021-7kb`'s deploy time
  (2026-07-26T18:24:35Z) — would indicate the extra `COUNT` query itself is
  a problem, independent of whether data matches.
- Repeated `"Shadow read verification failed for ..."` log lines (the
  comparison itself throwing — e.g. a query timeout) — this is a distinct
  failure mode from a data mismatch and should be triaged separately.

---

## 5. Metrics to monitor — and a real limitation

`app/utils/tenant_metrics.py` is an **in-process, in-memory** counter
module by explicit design (see its own docstring) — there is no
`/metrics` endpoint anywhere in this API (verified: grepped the whole
`app/api` tree, nothing exposes it) and no external metrics backend wired
up yet. Concretely, this means:

- Counters reset to zero on every container restart and every scale-to-zero
  cold start. Cloud Run scales this service to zero when idle.
- Counters are **per-instance**, not aggregated. If traffic is ever served
  by more than one warm instance simultaneously, no single counter reflects
  the whole picture.
- There is currently no way to query "current mismatch count" on demand —
  the only durable, cross-instance record of a mismatch is the **log line**
  it emits at the moment it happens (§6). Treat the log stream, not the
  counter, as the source of truth for this bake period.

This is a real gap, not a hypothetical one — it was verified while writing
this runbook (attempted to find historical `logger.info` output over a 7-day
window and found none reaches Cloud Run at all; see §6 for why). Wiring a
real metrics backend is out of scope for this milestone; it's a fair
candidate for a P2 issue if the bake period's log-only visibility proves
insufficient in practice.

---

## 6. Cloud Run log queries

**Important, verified-this-session caveat:** this app does not call
`logging.basicConfig()` anywhere, so no handler is attached to its loggers.
Practical effect, confirmed by direct testing against production:

- `logger.info(...)` calls are silently dropped — never reach Cloud Run at
  all (Python's `logging.lastResort` handler only activates for
  `WARNING`+).
- `logger.warning(...)` / `logger.error(...)` calls **do** reach Cloud Run
  (via `logging.lastResort` → stderr → captured as `textPayload`), but
  **without a populated `severity` field** — `severity>=WARNING` filters
  will silently miss them. Verified directly: a real `logger.error()` call
  elsewhere in the app appeared in `textPayload` with a blank severity.

**Use content matching, not severity filters.**

Find any shadow-read mismatch, all time:
```bash
gcloud logging read '
  resource.type="cloud_run_revision"
  AND resource.labels.service_name="voxly-backend"
  AND textPayload:"Shadow read mismatch"
' --project=voxly-491010 --format="value(timestamp,textPayload)" --order=asc
```

Find any shadow-verify internal failure (query error, not a data mismatch):
```bash
gcloud logging read '
  resource.type="cloud_run_revision"
  AND resource.labels.service_name="voxly-backend"
  AND textPayload:"Shadow read verification failed"
' --project=voxly-491010 --format="value(timestamp,textPayload)" --order=asc
```

Tail continuously during active monitoring:
```bash
gcloud beta logging tail '
  resource.type="cloud_run_revision"
  AND resource.labels.service_name="voxly-backend"
  AND (textPayload:"Shadow read" OR textPayload:"shadow_read_mismatch")
' --project=voxly-491010
```

Sanity-check the 5 endpoints are being called at all (confirms the wiring
has traffic to observe, independent of match/mismatch):
```bash
gcloud logging read '
  resource.type="cloud_run_revision"
  AND resource.labels.service_name="voxly-backend"
  AND (textPayload:"GET /api/v1/clients" OR textPayload:"GET /api/v1/projects"
       OR textPayload:"GET /api/v1/milestones" OR textPayload:"GET /api/v1/api-keys"
       OR textPayload:"GET /api/v1/ai-keys")
' --project=voxly-491010 --freshness=1d --format="value(timestamp,textPayload)" --limit=50
```

---

## 7. How to investigate a mismatch

Each mismatch log line carries everything needed to reproduce it:

```
Shadow read mismatch for <table_name>: legacy=<N> org_scoped=<M> org_id=<uuid> user_id=<uuid>
```

1. **Pull the exact log line** (§6 query) — note `table_name`, `legacy`,
   `org_scoped`, `org_id`, `user_id`, and the timestamp.
2. **Reproduce read-only, directly against production**, e.g. for `clients`:
   ```sql
   -- legacy count (what the endpoint actually returned)
   SELECT count(*) FROM clients WHERE user_id = '<user_id>' AND deleted_at IS NULL;
   -- org-scoped count (what shadow-verify computed)
   SELECT count(*) FROM clients WHERE org_id = '<org_id>' AND deleted_at IS NULL;
   -- the actual diverging rows
   SELECT id, user_id, org_id, deleted_at FROM clients WHERE user_id = '<user_id>' OR org_id = '<org_id>';
   ```
   Adjust the table/columns per which endpoint logged the mismatch —
   `milestones` has no `org_id` column of its own; its org-scoped count
   joins through `projects` (see `_make_org_scoped_milestone_count` in
   `backend/app/api/v1/milestones.py`), so investigate via that join instead.
3. **Check the likely causes**, roughly in order of plausibility given
   what this migration actually does:
   - A row created **before** `DUAL_WRITE_ORGANIZATIONS_ENABLED` first went
     live and never backfilled (`org_id IS NULL`) — check
     `backend/app/scripts/backfill_organizations.py --verify` coverage.
   - A row whose `org_id` was backfilled to a *different* organization than
     the user's current personal org — possible if a user's org identity
     changed shape between backfill and now (shouldn't happen post the
     `uq_organizations_owner_user_id` constraint, but confirm).
   - Soft-delete state disagreement — `deleted_at` filtering differs
     between the legacy and org-scoped query paths for that table (only
     `clients` has this column among the 5).
   - A genuine bug in the specific `_org_scoped_*_count` helper for that
     endpoint (e.g. a missed filter) — check the helper's `.filter(...)`
     clause against the legacy query's filters side by side.
4. **Do not silently dismiss a single mismatch as noise.** Per §4, every
   occurrence is a bake-period failure signal. If root-caused to a known,
   already-fixed class of issue (e.g. a specific pre-backfill row you can
   name), record it in the bake-period log (§9) with the explanation —
   "explained" is a different bar than "ignored."

---

## 8. Rollback procedure

Shadow-verify is read-only and fails safe — there is **no data to roll
back**, only the flag. Disable it the same way it was enabled, as an
isolated env-var change (merge semantics, not a full env replace):

```bash
gcloud run services update voxly-backend --region=us-central1 --project=voxly-491010 \
  --update-env-vars=DUAL_READ_SHADOW_VERIFY_ENABLED=false --quiet
```

Then update `backend/env.yaml` locally to match (`DUAL_READ_SHADOW_VERIFY_ENABLED: "false"`)
so a future `--env-vars-file` deploy doesn't silently re-enable it.

Rollback triggers:
- A latency/error-rate regression traced to the extra `COUNT` query (§4).
- A need to pause the bake period for any operational reason — rollback is
  cheap and reversible in either direction, so there's no cost to pausing
  rather than pushing through a noisy signal.

Rolling back does **not** require rolling back `DUAL_WRITE_ORGANIZATIONS_ENABLED`
or the application code — the two flags are independent, and the dual-write
path has already been running in production since the earlier stabilization
phase with no rollback need.

---

## 9. Exit criteria for the bake period

All of the following, not any one alone:

1. **Minimum duration**: at least the 1–2 weeks specified in
   `ORGANIZATION_FIRST_ARCHITECTURE.md` §15 — a short clean window with
   negligible traffic proves little.
2. **Real traffic coverage**: all 5 endpoints have been exercised by real
   (not only synthetic/smoke-test) usage during the window. If actual
   dogfooding traffic is thin, extend the bake period rather than declare
   success on a small sample.
3. **Zero unexplained mismatches**: every mismatch log line from §6 has
   either not occurred, or has been individually root-caused and recorded
   per §7 — not just observed and ignored.
4. **No performance regression** attributable to the added query, per §4.
5. **`backfill_organizations.py --verify` shows full coverage** at the end
   of the window (zero rows with `org_id IS NULL` across the 5 tables in
   scope) — a persistent coverage gap here is a likely source of latent
   mismatches even if none have logged yet.

---

## 10. End-of-bake-period checklist

Run through this in full before requesting approval to begin Step 2 (read
cutover). Do not start Step 2 work while any item is unchecked.

- [ ] Bake period ran for the full planned duration (≥ 1–2 weeks) with the
      flag continuously enabled (confirm no accidental disable via an
      intervening full-env-replace deploy — check `env.yaml` history / any
      deploys during the window).
- [ ] Ran the §6 "any mismatch, all time" log query covering the entire
      bake window — zero hits, or every hit is individually logged with
      root cause in the bake-period log below.
- [ ] Ran the §6 "shadow-verify internal failure" query — zero hits, or
      every hit investigated (query timeouts, unexpected exceptions).
- [ ] Confirmed real (non-synthetic) traffic hit all 5 endpoints during the
      window — pulled a rough request count per endpoint from logs.
- [ ] Compared latency/error rate on the 5 endpoints before vs. after
      revision `voxly-backend-00021-7kb` — no attributable regression.
- [ ] Ran `backfill_organizations.py --verify` (or the equivalent read-only
      SQL check used earlier this engagement) — zero unbackfilled rows
      across `clients`, `projects`, `milestones`(via project join),
      `api_keys`, `user_ai_keys`.
- [ ] Every mismatch found (if any) has a written explanation in the
      bake-period log, not just a dismissal.
- [ ] Written summary produced for approval: duration observed, mismatch
      count, traffic volume, performance delta, and an explicit
      recommendation (proceed to Step 2 / extend bake / do not proceed).
- [ ] Explicit approval obtained before any Step 2 work (read cutover)
      begins — this runbook and its checklist do not themselves constitute
      that approval.

### Bake-period log (fill in as it runs)

| Date | Event | Details | Resolution |
|---|---|---|---|
| 2026-07-26 | Bake period started | `DUAL_READ_SHADOW_VERIFY_ENABLED=true` on `voxly-backend-00021-7kb` | — |
| 2026-07-27 | Day 1 automated check | Window 2026-07-26T18:24:35Z → 2026-07-27T09:31:53Z. Mismatches: **0**. Internal failures: **0**. Traffic (real, excluding pre-flag requests): clients 8, projects 8 (incl. 1 `client_id`-filtered call), milestones 1, api-keys 1, ai-keys 1. | Clean, but thin: milestones/api-keys/ai-keys traffic so far is only the single smoke-test hit each at flag-enable time, no repeat real usage since — per §9 exit criterion 2, do not treat this as coverage yet. Watch whether this improves over the next few days. |
| | | | |
