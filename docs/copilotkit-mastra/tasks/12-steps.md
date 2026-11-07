# 12 · Progress tracker — CopilotKit–Mastra reliability

**Live status file.** Update this after every step; the plan itself lives in [`11-copilotkit-mastra-plan.md`](./11-copilotkit-mastra-plan.md).

| Field | Value |
|---|---|
| Last updated | **2026-11-07** (merged PRs verified; open work: **#796** cleanup, **#798** this tracker, **#778** support docs) |
| `origin/main` | **`14bf8b3926`** |
| Production `/api/version` | **`14bf8b3926`** — matches main (`#777`, `#787`, `#792`, `#793`, `#786` all in it) |
| Working worktree | `/home/sk/.worktrees/mde-ai-rel` **removed** after #792 merged (clean, pushed, no processes) |
| Installed stack | CopilotKit **1.84.1** · AG-UI **1.0.2** · `@ag-ui/mastra` **2.0.2** · Mastra core **1.81.0** · memory 1.40.0 · pg 1.34.0 |

**Legend:** ✅ done & verified · 🟡 implemented, awaiting merge/verification · ⬜ not started · 🔴 blocked · ⚫ not needed (measurement said no)

---

## Status board

| Step | Status | Evidence | PR / SHA | Next action |
|---|---|---|---|---|
| **0** Prep worktree + pin SHA | ✅ | `npm ci` exit 0; prod pinned before/after each batch | — | — |
| **A1** Restore gated on `isReady` | ✅ **certified** | **20/20 journeys** on pinned `8114a5a96382` (10 desktop + 10 mobile, 0 retries, 0 skips, 0 flaky); hydration suite 30 passed | [#777](https://github.com/amoai-tech/mdeai/pull/777) merged | — |
| A1 duplicate attempt | ✅ closed | same defect implemented twice | [#779](https://github.com/amoai-tech/mdeai/pull/779) **CLOSED** | — |
| **A2** No answer ≠ success | ✅ | already in main: `sendAndWait` captures `repliesBefore` before submit, waits for a NEW reply and asserts it is nonempty; `waitForConciergeReply` polls for that reply | [#780](https://github.com/amoai-tech/mdeai/pull/780) **CLOSED** as superseded | — |
| **A3** First-send 401 | ✅ | readiness now requires **HTTP 200** from `POST /api/copilotkit {"method":"info"}` (anonymous returns 401); a rejected fetch no longer counts as ready | [#787](https://github.com/amoai-tech/mdeai/pull/787) merged | — |
| **A4** Cleanup that survives a killed run | 🟡 | in-process: `#787` ownership sweep + `#792` (merged) failing cleanup now FAILS the run instead of being swallowed (3 unit tests). Independent: `#796` extends the nightly `qa-fixture-cleanup.yml` to the whole `@qa-isolation.mdeai.co` domain, per-identity savepoints, verified rows | [#787](https://github.com/amoai-tech/mdeai/pull/787) · [#792](https://github.com/amoai-tech/mdeai/pull/792) merged · [#796](https://github.com/amoai-tech/mdeai/pull/796) **open** | merge #796; it found **3 real leaks 12–13 days old** that the old `qa-%` pattern could never see |
| **B1** 60 s page readiness | 🟡 **measured** | 5 direct loads: canvas `1690 / 497 / 502 / 443 / 541 ms`, composer +~20 ms, history region ready `1733 / 542 / 544 / 464 / 563 ms` → **0.46–1.73 s**, not 60 s | — | the 60 s event is an **outlier** (edge/network), not a product readiness defect; capture the failing run's network trace if it recurs |
| **B2** `TypeError: network error` | ⬜ | observed once; **not** proven to be Gemini | — | trace one failure end to end |
| **C1** End-to-end tracing | ⬜ | turn log + `ai_runs` exist; no correlation ids | — | correlate with existing ids |
| **C2** Working-memory concurrency | ⬜ | MDE uses **thread-scoped** memory and a local read-modify-write; Mastra native atomic `mergeWorkingMemory()` requires **resource scope** | — | reproduce with two writers; preserve thread isolation and `selectedPinId: null`; do not blindly swap APIs |
| **C3** Runtime init cost | ⬜ | unmeasured | — | measure before touching |
| **Support** CopilotKit skill fallback | 🟡 | docs search fails in the MCP; skill now documents the explorer fallback | [#778](https://github.com/amoai-tech/mdeai/pull/778) | approve or fold into C1 work |
| Plan document | ✅ | **313-line** plan, merged with this tracker | [#793](https://github.com/amoai-tech/mdeai/pull/793) **merged** `aa9bdfa3` | — |

---

## Where the incident actually stands

| Question | Answer |
|---|---|
| Does Camila still lose her conversation? | **No — certified**: 20/20 journeys (10 desktop + 10 mobile) on pinned `8114a5a96382`, 0 retries/skips/flaky; re-click erasure fixed and live |
| Is the cause proven? | **Yes.** Mechanism proven in SDK source (`isReady === false` ⇒ provisional agent ⇒ messages lost on swap) and fixed by #777, which is in production |
| Are the tests honest? | **Yes** — five separate false-green classes closed; 29 turn-completion cases incl. HTTP failure and empty answers |
| Is the timer logic removed? | **No, deliberately.** `isReady` proves connection, not replay completion |
| QA data clean? | **Yes, 0 leftover `qa-san1298` accounts** (verified twice, incl. threads) |

---

## Ordered next steps

### Completed — do not repeat
- [#777](https://github.com/amoai-tech/mdeai/pull/777) merged; chat restore certified **20/20** on pinned production SHA `8114a5a96382`.
- [#780](https://github.com/amoai-tech/mdeai/pull/780) closed as superseded; new nonempty assistant replies already required.
- [#787](https://github.com/amoai-tech/mdeai/pull/787) merged; A3 authenticated readiness requires a **200** response; A4 suite-owned/expired identity cleanup added.
- [#792](https://github.com/amoai-tech/mdeai/pull/792) merged as `583dcbd6a6`; a test that fails **while cleaning up** now fails the run instead of swallowing the error (3 failure-injection tests).
- [#793](https://github.com/amoai-tech/mdeai/pull/793) merged as `aa9bdfa3`; these trackers.
- [#786](https://github.com/amoai-tech/mdeai/pull/786) merged; CI-only Playwright container benchmark (no product code).
- `/home/sk/.worktrees/mde-ai-rel` **removed** after #792 merged — it was clean, its commit was pushed, and no process used it.
- **2026-11-07:** production verified serving `14bf8b3926` (= `main`), and a desktop + mobile journey smoke passed on that SHA (2 passed, 1.9 min, pinned before and after).

### Now — smallest safe ordered work
1. **Finish [#796](https://github.com/amoai-tech/mdeai/pull/796)** — independent nightly cleanup. Two blockers before merge: (a) the CI backup must not export chat/profile contents as an artifact, and (b) the `review / review` job must produce a real current-head review instead of failing `NO_REVIEW` because its configuration ignored the PR title. It already found **3 real leaked accounts** aged 12–13 days that the previous `qa-%` pattern could never match.
2. **Merge [#798](https://github.com/amoai-tech/mdeai/pull/798)** — this tracker. Docs only; no browser recertification.
3. **B2 + C1 diagnostics (do them together):** one correlation path across browser → `/api/copilotkit` → AG-UI/Mastra → provider/tool → stream completion, recording failures **without** storing private prompts. Reuse the existing turn log and `ai_runs`; do not add a second observability platform, and do not attach a duration to the historical one-off.
4. **C2 working memory:** reproduce with two simultaneous writers (two tabs changing preferences in the same conversation) before touching the merge path — Mastra's native atomic merge needs **resource** scope, MDE uses **thread** scope. Change code only if the test proves a defect.
5. **C3 + search coverage:** measure `buildHandler()` / `new CopilotRuntime()` before optimizing, and compare searchable listings with embedded listings before backfilling. Never invent inventory to fill a coverage gap.

### Deployment and promotion — read before touching production
Promotion is **asynchronous**. The `Prod deploy freshness` guard waited 9, 13 and 19 polls (≈4.5–9.5 min) after a build was READY before the domain served the new commit, and passed every time. **READY ≠ served** — always prove it with `/api/version`.

If that guard fails, follow [Production release verification](../../07-operations/production-release-verification.md) (recover a release blocked by Floor) and its exact-SHA certification path. **Never run `vercel promote` to skip certification or to serve an uncertified candidate** — a failed guard is a signal to diagnose, not permission to bypass.

### Tracking and closeout
- [SAN-1639](https://linear.app/amo100/issue/SAN-1639) and [SAN-1298](https://linear.app/amo100/issue/SAN-1298) are **Done** for the previously certified product milestone; keep instrumentation/cleanup work open until actually implemented.
- Update this tracker after each exact-head merge and deployment; never combine evidence from different SHAs.

---

## Blockers and failure points

| # | Current status | Impact | Mitigation |
|---|---|---|---|
| 1 | ~~#792 pending approval/merge~~ | **resolved** — merged `583dcbd6a6` and in production | — |
| 2 | ~~#793 pending docs merge~~ | **resolved** — merged `aa9bdfa3` | — |
| 3 | **#796 open: CI backup exposure + ignored PR-Agent review** | Chat/profile contents could land in a CI artifact; the review gate fails for a configuration reason | Redact the backup, fix the review configuration, then merge and verify one scheduled run |
| 4 | **Kill during teardown not recovered automatically** | A test identity can outlive a killed process (a 2-hour age check is a time assumption, not proof) | #796's nightly sweep today; a run-owner lease is the real fix |
| 5 | **B2 network error untraced** (one-off; **no evidence for any duration**) | A recurrence cannot be attributed to a boundary | Trace browser → runtime → agent → provider without hiding errors. `420_000` is the configured **test cap**, not a measured hang |
| 6 | **Production SHA can change during testing** | Mixed-release counts are invalid | Pin `/api/version` before/after, separate releases |
| 7 | **Maps error owned separately** | Google Maps `503` remains a distinct diagnostic | Inspect the failed request and Google Cloud metrics; never suppress the error |
| 8 | **CopilotKit/Mastra MCP documentation availability varies** | Tool-based docs lookup may fail | Follow installed package types and official docs; [#778](https://github.com/amoai-tech/mdeai/pull/778) tracks the fallback |

**Resolved (not blockers):** #777 merge, #780 duplication, #792/#793 merges, the original 8/10 desktop matrix, and the HTTP 401 fix in #787. The 20/20 certification is historical evidence for `8114a5a96382`, not a blanket certification for every later SHA.

---

## Snapshot history (production)

| When | SHA | Note |
|---|---|---|
| 2026-11-05 | `36020745cfe8` | PR #769 merge; 18/20 matrix run here |
| 2026-11-06 | `9b8b25c96d3` | PR #777 merge |
| 2026-11-06 | `8114a5a96382` | **certification run: 20/20** |
| 2026-11-06 | `583dcbd6a631` | PR #792 merge |
| 2026-11-07 | **`14bf8b3926`** | current `main` = production; desktop + mobile smoke passed here |
