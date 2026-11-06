# 12 · Progress tracker — CopilotKit–Mastra reliability

**Live status file.** Update this after every step; the plan itself lives in [`11-copilotkit-mastra-plan.md`](./11-copilotkit-mastra-plan.md).

| Field | Value |
|---|---|
| Last updated | 2026-11-05 (evening, America/Bogotá) |
| `origin/main` | **`7c753cd6b1`** |
| Production `/api/version` | **`7c753cd6b1`** — matches main; #777 and #787 are both in it |
| Working worktree | `/home/sk/.worktrees/mde-ai-rel` (detached at `origin/main`, clean) |
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
| **A4** Cleanup that survives a killed run | 🟡 | ownership-aware sweep merged (`ownedIds` + 60-min margin, full pagination that throws, row-level verification); new proof test seeds a real thread+message and asserts deletion | [#787](https://github.com/amoai-tech/mdeai/pull/787) merged · [#792](https://github.com/amoai-tech/mdeai/pull/792) open | one orphan was produced by a **failing** cleanup test (fixed in #792); a kill **during teardown** still needs an external job |
| **B1** 60 s page readiness | 🟡 **measured** | 5 direct loads: canvas `1690 / 497 / 502 / 443 / 541 ms`, composer +~20 ms, history region ready `1733 / 542 / 544 / 464 / 563 ms` → **0.46–1.73 s**, not 60 s | — | the 60 s event is an **outlier** (edge/network), not a product readiness defect; capture the failing run's network trace if it recurs |
| **B2** `TypeError: network error` | ⬜ | observed once; **not** proven to be Gemini | — | trace one failure end to end |
| **C1** End-to-end tracing | ⬜ | turn log + `ai_runs` exist; no correlation ids | — | correlate with existing ids |
| **C2** Working-memory atomic merge | ⬜ | root cause **identified**: `@mastra/pg` supports row-locked merge; MDE does a local read-modify-write | — | two-writer test, then swap |
| **C3** Runtime init cost | ⬜ | unmeasured | — | measure before touching |
| **Support** CopilotKit skill fallback | 🟡 | docs search fails in the MCP; skill now documents the explorer fallback | [#778](https://github.com/amoai-tech/mdeai/pull/778) | approve or fold into C1 work |
| Plan document | 🟡 | **301 lines**, §8 source receipts (28 verified URLs) | uncommitted on `docs/san-1638-merge-history` | commit as docs PR |

---

## Where the incident actually stands

| Question | Answer |
|---|---|
| Does Camila still lose her conversation? | **Not reproduced** in 18 journeys; re-click erasure is fixed and live |
| Is the cause proven? | **Mechanism proven in SDK source** (`isReady === false` ⇒ provisional agent ⇒ messages lost on swap). **Live proof needs #777 deployed** |
| Are the tests honest? | **Yes** — five separate false-green classes closed; 29 turn-completion cases incl. HTTP failure and empty answers |
| Is the timer logic removed? | **No, deliberately.** `isReady` proves connection, not replay completion |
| QA data clean? | **Yes, 0 leftover `qa-san1298` accounts** (verified twice, incl. threads) |

---

## Ordered next steps

### Now (needs a human)
1. **Approve [#777](https://github.com/amoai-tech/mdeai/pull/777)** — `floor` green, 0 unresolved threads.
2. **Approve [#780](https://github.com/amoai-tech/mdeai/pull/780)** once its `floor` is green.
3. Merge in that order, then verify `/api/version` flips and record the new SHA.

### Immediately after the deploy (agent, ~40 min)
4. Pin the new `/api/version`; run the cross-screen journey **4×** (desktop + mobile) as a smoke of the fix.
5. **A3**: add the authenticated-readiness wait before the first send; re-run the 10 desktop + 10 mobile matrix on the pinned SHA. Target **20/20**.

### Then (agent, ~2 h)
6. **A4**: suite-level cleanup sweep; prove it with a deliberately killed run.
7. **B1 / B2**: measure the 60 s readiness and trace one `network error`. Assign ownership only with data.

### Last (agent, ~4 h)
8. **C1** tracing → **C2** working-memory swap (two-writer test first) → **C3** runtime-init measurement.

### Closeout
9. Reconcile **SAN-1639** (currently *In Progress*) and **SAN-1298** checkpoint 2 against the 20/20 matrix on the deployed SHA.
10. Commit the plan docs (`11` + `12`) as a docs PR.

---

## Blockers and failure points

| # | Blocker | Impact | Mitigation |
|---|---|---|---|
| 1 | **No approval yet** on #777 / #780 | the root-cause fix is not live | approve, merge, redeploy, verify SHA |
| 2 | `floor` was still **pending** on #780 at last check | cannot merge | wait, do not bypass |
| 3 | Production SHA drifts (moved **twice** today) | evidence expires | pin before/after; split by SHA |
| 4 | Desktop 401 on first send | matrix stuck at 8/10 | auth readiness before send |
| 5 | Maps `503` / `mapId` config | console assertion fails | real config finding — fix config, do not filter |
| 6 | Original race **unproven live** | cannot call SAN-1639 Done | deploy #777, then 20/20 matrix |
| 7 | `mastra_docs` local-package tools broken | misleading `@mastra/mcp` listing | read `node_modules` types directly |
| 8 | CopilotKit MCP semantic search down | falls back to `explore-code` | use explorer; #778 documents it |

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
