# 12 · Progress tracker — CopilotKit–Mastra reliability

**Live status file.** Update this after every step; the plan itself lives in [`11-copilotkit-mastra-plan.md`](./11-copilotkit-mastra-plan.md).

| Field | Value |
|---|---|
| Last updated | 2026-11-06 (after PR #787 merge; PR #792/#793 still open) |
| `origin/main` | **`7c753cd6b1`** |
| Production `/api/version` | **`7c753cd6b1`** — matches main; #777 and #787 are both in it |
| Working worktree | `/home/sk/.worktrees/mde-ai-rel` retained for PR #792 until merged; verify clean/no processes before removing |
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
| **A4** Cleanup that survives a killed run | 🟡 | existing ownership-aware sweep from #787 checks its own run IDs and older identities; #792 adds `try/finally` and error-propagating cleanup with 3 unit tests | [#787](https://github.com/amoai-tech/mdeai/pull/787) merged · [#792](https://github.com/amoai-tech/mdeai/pull/792) open | merge #792 after current-head CI/approval; a process killed during teardown still requires independent cleanup |
| **B1** 60 s page readiness | 🟡 **measured** | 5 direct loads: canvas `1690 / 497 / 502 / 443 / 541 ms`, composer +~20 ms, history region ready `1733 / 542 / 544 / 464 / 563 ms` → **0.46–1.73 s**, not 60 s | — | the 60 s event is an **outlier** (edge/network), not a product readiness defect; capture the failing run's network trace if it recurs |
| **B2** `TypeError: network error` | ⬜ | observed once; **not** proven to be Gemini | — | trace one failure end to end |
| **C1** End-to-end tracing | ⬜ | turn log + `ai_runs` exist; no correlation ids | — | correlate with existing ids |
| **C2** Working-memory concurrency | ⬜ | MDE uses **thread-scoped** memory and a local read-modify-write; Mastra native atomic `mergeWorkingMemory()` requires **resource scope** | — | reproduce with two writers; preserve thread isolation and `selectedPinId: null`; do not blindly swap APIs |
| **C3** Runtime init cost | ⬜ | unmeasured | — | measure before touching |
| **Support** CopilotKit skill fallback | 🟡 | docs search fails in the MCP; skill now documents the explorer fallback | [#778](https://github.com/amoai-tech/mdeai/pull/778) | approve or fold into C1 work |
| Plan document | 🟡 | **325-line** plan and this tracker prepared in existing docs PR | [#793](https://github.com/amoai-tech/mdeai/pull/793) **open** | resolve review, pass exact-head CI, merge; avoid duplicate docs PRs |

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
- Follow-up 4-journey smoke on `7c753cd6b1` reported passed. Historical results remain attached to their own SHAs.

### Now — smallest safe ordered work
1. Finish [#792](https://github.com/amoai-tech/mdeai/pull/792): preserve the original test failure, propagate or log cleanup failure correctly, pass exact-head CI, obtain required independent approval, then merge. Recheck orphan users, profiles, threads and messages.
2. Finish [#793](https://github.com/amoai-tech/mdeai/pull/793): resolve contradictory tracker wording, pass CI and independent approval, then merge as **docs-only** work (no browser recertification for docs).
3. **B2/C1 diagnostics:** instrument browser → `/api/copilotkit` → AG-UI/Mastra → provider/tool → stream. Correlate existing request/turn IDs and log a future hang/network failure. Do not invent a cause for the historical one-off.
4. **Interrupted-run hygiene:** add an independent CI/scheduled cleanup job that survives a killed process, with run ownership/lease or deliberately aged cleanup and explicit DB verification. Do not delete another active suite's account.
5. **Worktree cleanup:** after #792 is merged and no process/files need `mde-ai-rel`, check ancestry, worktree status and processes; then `git worktree remove` normally (never force).
6. **C2/C3** only after measurement: prove two-writer thread-memory conflict and runtime initialization cost before changing semantics or introducing architecture.

### Tracking and closeout
- [SAN-1639](https://linear.app/amo100/issue/SAN-1639) and [SAN-1298](https://linear.app/amo100/issue/SAN-1298) are **Done** for the previously certified product milestone; keep separate instrumentation/cleanup work open until actually implemented.
- Update this tracker after each exact-head merge and deployment; never combine evidence from different SHAs.

---

## Blockers and failure points

| # | Current status | Impact | Mitigation |
|---|---|---|---|
| 1 | **#792 pending independent approval/merge** | Error-reporting cleanup not yet in `main` | Current-head CI + review, merge, prove failure-injection cleanup |
| 2 | **#793 pending docs review/merge** | Stale steps mislead the next operator | Correct factual contradictions; docs-only merge |
| 3 | **Kill during teardown not recovered automatically** | Test identity can remain after a process is terminated | Independent ownership-aware cleanup job; verify all related rows |
| 4 | **B2 network error / 420 s hang untraced** | Future recurrence cannot be assigned to an exact failing boundary | Trace browser/runtime/agent/provider without hiding errors |
| 5 | **Production SHA can change during testing** | Mixed-release counts are invalid | Pin `/api/version` before/after, separate releases |
| 6 | **Maps error owned separately** | Google Maps `503` remains a distinct diagnostic | Map ID presence verified; inspect failed request and Google Cloud metrics, don't suppress errors |
| 7 | **CopilotKit/Mastra MCP documentation availability varies** | Tool-based docs lookup may fail | Follow installed package types and official code/docs; #778 tracks fallback |

**Resolved (not blockers):** #777 merge, #780 duplication, original 8/10 desktop matrix, and the HTTP 401 assertion fix in #787. The 20/20 certification is historical evidence for `8114a5a96382`, not a blanket certification for every later SHA.

---

## Snapshot history (production)

| When | SHA | Note |
|---|---|---|
| earlier today | `36020745cfe8` | PR #769 merge; 18/20 matrix run here |
| later | `9b8b25c96d3` | PR #777 merge — deployed (`dpl_DZy9MCtksu`) |
| later | `f0bf7c32c1` | intermediate |
| later | `8114a5a96382` | **certification run: 20/20** |
| now | **`7c753cd6b1`** | current main = production; post-merge smoke re-run here |

> A result is only valid for the SHA it ran on. Re-run, do not re-label.
