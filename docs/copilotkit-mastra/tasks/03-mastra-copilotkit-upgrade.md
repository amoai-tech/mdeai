# 03 — Verification: Mastra 1.81, CopilotKit 1.84.1 and AG-UI 1.0.2

**Verified:** 2026-11-04 (America/Bogota)
**Historical production release verified on 2026-11-04:** `61efd9723d6d302f84c833ce8874670b27e74e87`. At that verification time, `/api/version` matched `origin/main`. This is a dated evidence snapshot, **not** a claim that today's production still serves that commit.
**Verification scope:** the clean install and local test matrix below ran on `df868d1afc`; a separate GitHub `floor` passed on `61efd9723d`; the **20 production browser checks** ran on the earlier release and Stop/Retry **2/2** was re-run on `61efd9723d`. See §§2–3 for exact evidence.
**Verdict (at the time):** the three upgrades were implemented, integrated and deployed. The Stop/Retry false-error defect was subsequently fixed by PR #741 and verified on the historical `61efd9723d` production release.

> This file reports only what was measured. Where a claim is unproven it is marked **not tested**, never PASS.

---

## 1. Installed versions (from `package.json` + a clean `npm ci` on `df868d1a`)

| Package | Expected | Installed | Match |
|---|---|---|---|
| `@copilotkit/react-core` | 1.84.1 | **1.84.1** | ✅ |
| `@copilotkit/runtime` | 1.84.1 | **1.84.1** | ✅ |
| `@ag-ui/client` | 1.0.2 | **1.0.2** | ✅ |
| `@ag-ui/core` | 1.0.2 | **1.0.2** | ✅ |
| `@ag-ui/mastra` | 2.0.2 | **2.0.2** | ✅ |
| `@mastra/core` | 1.81.0 | **1.81.0** | ✅ |
| `@mastra/pg` | — | 1.34.0 | — |
| `@mastra/memory` | — | 1.40.0 | — |
| `chat` | — | 4.44.0 | — |

`npm ci` → exit 0. One copy each of `@ag-ui/client` and `@ag-ui/core` (no duplicate `AbstractAgent`).

### Security (CVE-2026-8769)

Resolved tree after the lower-bounded overrides merged in #735:

```
1 × 3.0.28
5 × 4.0.33
1 × 4.0.62     ← above 4.0.33, unaffected
```

**Zero instances inside any advisory range** (`<3.0.28`, `>=4.0.0-beta.10 <4.0.33`, `>=5.0.0-beta.0 <5.0.1`). The `@ai-sdk/provider-utils@2.2.8` chain that `@ag-ui/mastra@1.1.6` used to pull through `@ai-sdk/ui-utils` is gone at the source, and the 3.x override is lower-bounded so a 2.x chain can never be dragged across a major.

---

## 2. Repository gates — exact commit `df868d1afc`

| Test | Commit | Passed | Failed | Skipped | Evidence |
|---|---|---:|---:|---:|---|
| Clean install | `df868d1afc` | — | 0 | — | `npm ci` exit 0 |
| TypeScript | `df868d1afc` | — | **0** | — | `tsc --noEmit --incremental false` exit 0 |
| Lint | `df868d1afc` | — | **0** | — | `npm run lint` exit 0 (`--max-warnings 0`) |
| Mastra suite | `df868d1afc` | **836** | 0 | 46 | `npm run test:mastra` |
| Full Vitest | `df868d1afc` | **4861** | **0** | 51 | `npm test` (588 files passed) |
| CopilotKit v2 audit | `df868d1afc` | — | 0 | — | `audit:copilotkit-v2`: 0 violations, **0 v1 imports added** |
| Playwright (production) | `df868d1afc` | **20** | **0** | 1 | see §3 |

**Separate later release evidence:** GitHub CI [`floor` on `61efd9723d`](https://github.com/amoai-tech/mdeai/actions/runs/41936993674/job/126947846116) **passed**, including lint, TypeScript, Next.js build, full Vitest (**4,869 passed, 49 skipped; 588 test files passed**) and `check:mastra`. The earlier **4,861** count belongs only to `df868d1afc`; it must not be used as test proof for the subsequently merged PR #741 fix. CI [`floor` on the earlier PR #744 documentation commit `2272965`](https://github.com/amoai-tech/mdeai/actions/runs/41952363310/job/126999043407) likewise passed with **4,869 passed, 49 skipped**; that is a documentation-branch gate, not a production browser run. These GitHub `floor` jobs **do not** establish that all 20 authenticated browser checks were re-run on `61efd9723d`.

**Local environment limitation (historical):** `npm run floor` did not complete in the original shell because `scripts/__tests__/pr-agent-pinned-loader.test.mjs` ran as uid 65534 against a locally mode-`0600` file. That is a local runner permission issue; the linked GitHub CI `floor` passed on the later release. Do not confuse local shell failure with the GitHub gate result.

---

## 3. Production browser journeys — `https://www.mdeai.co`, SHA `df868d1afc` then `61efd9723d`

Authenticated with the dedicated renter QA identity (`qa-renter@mdeai.co`, `profile.role='user'`) and the existing admin/partner fixtures. **No Super Admin was substituted for a renter.**

| Suite | Result | What it proves |
|---|---|---|
| `prod-concierge-thread-lifecycle` | **4 passed** | two real turns; New Chat opens a new thread; a saved thread resumes; earlier messages replay once; another signed-in user and an anonymous caller are refused |
| `prod-copilotkit-isolation` | **9 passed** | two throwaway identities, real turns, cross-user denial, cleanup proven |
| `prod-signed-in-route` | **4 passed**, 1 skipped (opt-in) | signed-in `/saved` 200; signed-out redirect; **authenticated runtime boots with the pinned CopilotKit version and every canonical agent** |
| `prod-renter-mobile-chat` | **1 passed** | 390×844, grounded cards, follow-up, **both pre-replies survive a refresh** |
| `prod-concierge-stop-retry` | **2 passed** | real Stop ends the running state, no error banner, a later question yields a new assistant answer |

**Total: 20 passed, 1 skipped (opt-in admin), 0 failed** on `df868d1afc`.

After #738 and #741 merged, production moved to `61efd9723d` and the Stop/Retry suite was re-run on it: **2 passed (14.2 s)** — including the second test that previously failed intermittently. **The false-error defect is fixed in production.**

### Page-level checks

| Page | URL | Result |
|---|---|---|
| Homepage | `https://www.mdeai.co/` | 200 |
| Rentals | `https://www.mdeai.co/rentals` | 200 |
| Events | `https://www.mdeai.co/events` | 200 |
| AI chat | `https://www.mdeai.co/chat` | 200 |
| Version API | `https://www.mdeai.co/api/version` | 200, SHA matches `main` |
| Authenticated workspace | `https://www.mdeai.co/app` | redirects to `/login?next=%2Fapp` when anonymous — **expected**, not a broken page |

### Durable state read-back (Supabase, read-only)

| Measurement | Value |
|---|---|
| `public.mastra_threads` | 250 |
| `public.mastra_messages` | 690 |
| `public.mastra_workflow_run_owners` | 12 |
| `public.mastra_*` tables | **34**, RLS on **34**, FORCE RLS **34** |

Conversation rows are real and growing as journeys run; RLS and FORCE RLS are enabled on every Mastra table.

---

## 4. AG-UI 1.0 streaming and lifecycle

Verified against the **installed** `@ag-ui/core@1.0.2` schemas, not documentation prose:

```js
RunAgentInputSchema               → present at @ag-ui/core/schemas; rejects invalid input
RunFinishedEventSchema fields     → type, timestamp, rawEvent, metadata, threadId, runId, result, outcome, usage
{type:"cancelled"}                → VALID  (RunFinishedCancelledOutcomeSchema is a literal "cancelled")
{type:"interrupt",[]}             → INVALID ("expected array to have >=1 items")
{type:"interrupt",[{id,reason}]}  → VALID
{type:"success"}                  → VALID
```

Two behaviours that changed in AG-UI 1.0 and were handled:

1. **Validators moved.** `@ag-ui/client` no longer exports `RunAgentInputSchema`; the official export lives at `@ag-ui/core/schemas`. The import path was corrected — **no custom validator was written.**
2. **Stream field validation was dropped.** `transformHttpEventStream` no longer validates event fields, so a field-less `RUN_STARTED`/`RUN_FINISHED` pair resolved instead of rejecting. `assertLifecycleEventsCarryIdentity()` now asserts the spec-mandated `threadId`/`runId` where the decoded stream is returned, so the "a garbled stream is not progress" test keeps its meaning.

**Cancellation is not success:** `assertRunCompleted` rejects a `RUN_FINISHED` carrying a non-success `outcome`, and a schema-guard test parses every fixture through `RunFinishedEventSchema` so an impossible fixture fails loudly (merged in #732).

**Limit, stated plainly:** Mastra cancellation is cooperative. A stopped stream does **not** prove an already-running tool was interrupted. This was not measured server-side, so it is **not tested**, not PASS. Duplicate-write safety is proven separately by `rental-conversion-journey` (below).

---

## 5. Journeys — what passed, and what is not proven

| Journey | Status | Evidence |
|---|---|---|
| **A — Renter AI search + follow-up + refresh** | 🟢 PASS | renter identity; grounded cards; follow-up; both replies survive reload (`prod-renter-mobile-chat`, `prod-concierge-thread-lifecycle`) |
| **B — Stop / Retry** | 🟢 PASS; regression fixed | Initial testing found an intermittent false *"MDE could not answer that"* banner after Stop. PR [#741](https://github.com/amoai-tech/mdeai/pull/741) fixed it; `prod-concierge-stop-retry` subsequently passed **2/2** on production `61efd9723d`. See §6 for the original defect and fix. |
| **C — Viewing transaction, no duplicates** | 🟢 PASS | `rental-conversion-journey`: exactly one lead + one showing, replay creates nothing, wrong broker denied, rows cleaned (fixture `88528bbb`) |
| **D — Host / Events AI** | 🟡 PARTIAL | host continuity suite passes at 390px; two SAN-1396 host specs had wording/width failures triaged separately. Not re-run on `df868d1a` |
| **E — Security / mobile** | 🟢 PASS | isolation 9/9; guest `/api/copilotkit/info` → 401; 390×844 layouts pass |

---

## 6. Open defects and open PRs

### Confirmed defect — false "could not answer" after Stop (SAN-1636)

After Stop, the next question intermittently showed *"MDE could not answer that…"* even when it was answered (~50% of observed runs).

- **Root cause** — `src/components/rentals/rental-ask-composer.tsx` snapshot the **global** concierge error version and treated any later change as this turn's failure. A stopped run keeps finishing server-side, so its error landed while the next question was in flight.
- **Fix** — scope the verdict to this turn: compare the agent's assistant-message count before/after the send, and only report a failure when this turn produced no answer. Reads `agent.messages` directly because the rendered turns lag by a React commit — that lag *is* the race.
- **Proof** — RED → GREEN at component level: the new test fails on the old code (`expected <div id="rental-ask-error"> to be null`) and passes on the fix; a second test covers the real failure path. Later GitHub [`floor` on `61efd9723d`](https://github.com/amoai-tech/mdeai/actions/runs/41936993674/job/126947846116) reports **4,869 passed, 49 skipped**, not the earlier pre-fix 4,861. The production Stop/Retry suite passed **2/2** on that SHA.
- **Status** — [PR #741](https://github.com/amoai-tech/mdeai/pull/741) **merged and deployed** in `61efd9723d`. Confirmed live: `prod-concierge-stop-retry` **2 passed (14.2 s)** on that release, including the previously intermittent case.

### Merged PR — Stop/Retry production proof ([PR #738](https://github.com/amoai-tech/mdeai/pull/738))

**Merged.** Test-only. Its second test was the detector for SAN-1636; with the fix deployed it now passes, and it stays in CI as the permanent regression guard.

### CORRECTED — "no Stop control on `/chat`" was a false alarm

An earlier version of this report claimed `/chat` has no Stop control. **That was wrong**, and two direct probes on production settled it:

| Probe (on `/chat`, renter identity) | Result |
|---|---|
| `[data-testid="concierge-transcript-tail"]` during a run | **present** (`1`) |
| `[data-testid="welcome"]` during a run | **absent** (`0`) — the message view was mounted |
| Stop after *"2-bedroom in Laureles under 3M"* | **never appears** |
| Stop after *"Write me a short friendly paragraph about why Laureles is a good neighborhood."* | **appears at 2 028 ms** |

The tail is mounted and the button works. The first question is answered by the **rental fast path** — a structured search that runs without an agent stream — so there is genuinely nothing to stop, and `ConciergeStopButton` correctly renders nothing while `agent.isRunning` is false.

**Conclusion:** Stop is present and functional on `/chat` for every real agent run, and on `/rentals`. No product defect exists here. The only open question is cosmetic: whether a fast-path answer should show a brief busy indicator at all.

### Advisory

`npm audit` reports **55** pre-existing advisories (9 low / 25 moderate / 21 high, 0 critical), concentrated in `@a2ui/*`, `@ag-ui/*`, `@copilotkit/*`. They are unrelated to CVE-2026-8769 and mostly `fixAvailable: false` (upstream-bound). Not gating; tracked separately.

---

## 7. Linear tracker

| Task | Status | Verified / Applicable | Complete | PR(s) | Missing proof / next action |
|---|---|---:|---:|---|---|
| SAN-1626 · Upgrade Mastra 1.81 Agents, Workflows and Supabase Storage | 🟢 | 12/12 | 100% | #719 `9546b2e7`, #721 `dd9c5427`, #722 `0b162ea1`, #725 `ffedad8d` | None. WhatsApp deferred by product owner (excluded, not counted) |
| SAN-1629 · Upgrade CopilotKit v2 to 1.84 Without Breaking Chat | 🟢 | 12/12 | 100% | #728 `c49a8423`, #735 `6870154f`, #741 `61efd972` (merged SHA) | No Stop defect: the control appears for active agent generation; direct rental fast-path lookups do not have a running agent to stop |
| SAN-1605 · Upgrade AG-UI 1.0 Protocol and Mastra Adapter | 🟡 historical verification | 11/12 | 91.7% (≈92%) | #728 `c49a8423`, #732 `bf920e49`, #738, #741 | Server-side interruption of an in-flight database-writing tool was **not tested**, not PASS |
| SAN-1630 / 1631 / 1632 · interactive A2UI surfaces | 🔵 separate scope | 0/— | Not counted | — | Interactive product features are outside the framework-upgrade denominator |
| **Historical framework verification (before N/A classification)** | **🟡** | **35/36** | **97.2%** | | One unmeasured cancellation-during-write checkpoint; the retracted `/chat` Stop claim is **not** an open defect |

**Later scope decision, separate from the historical test results:** The Linear [SAN-1625 epic](https://linear.app/amo100/issue/SAN-1625) records SAN-1605 cancellation-during-write as **N/A, not passed** (no suitable development-safe agent-write fixture used). This changes the applicable denominator to **11/11 for SAN-1605** and **35/35 (100%) across the framework tasks**, without asserting that the unmeasured tool-abort behavior was tested. The separate A2UI features remain outside this figure.

**Percentage basis:** verified checkpoints ÷ applicable checkpoints. The historical 35/36 and later 35/35 figures describe **different scope decisions**, not additional test executions. Do not count N/A as PASS.

---

## 8. What is proven, what is not

**On `df868d1afc` (earlier evidence):** clean dependency installation, exact version and CVE checks, 0 TypeScript/lint errors, **4,861** Vitest tests, **836** Mastra tests, 0 CopilotKit v1 imports and **20** production browser checks (1 opted-out test skipped). Supabase checks recorded 34 Mastra tables with RLS + FORCE RLS. These are earlier-snapshot measurements.

**On `61efd9723d` (later production release at the time):** [GitHub CI `floor` passed](https://github.com/amoai-tech/mdeai/actions/runs/41936993674/job/126947846116), including lint, typecheck, build and **4,869** Vitest tests (49 skipped); the Stop/Retry production browser suite was separately re-run and passed **2/2 (14.2 s)** after PR #741. `/api/version` matched `origin/main` at that point. **The full set of 20 browser checks was not documented as re-run on this later SHA.**

**On the earlier PR #744 document-only commit `2272965` (before the review corrections):** [CI `floor` passed](https://github.com/amoai-tech/mdeai/actions/runs/41952363310/job/126999043407) with **4,869** tests passed and 49 skipped. This confirms the PR's repository gate, **not** a fresh deployment or end-to-end production certification.

**Not proven:** that Stop interrupts an already-running Mastra tool server-side (cooperative cancellation — unmeasured); Host/Events AI on the `61efd9723d` historical SHA; automated screenshots — the recorded Playwright production suites disabled screenshot/trace/video, so this report cites assertions rather than image artefacts.

**Not claimed:** public-launch certification, a successful server-side tool abort, or that green CI alone proves every production journey. Later Linear's 100% framework tally follows an N/A scope decision, **not** completion of the unmeasured experiment.
