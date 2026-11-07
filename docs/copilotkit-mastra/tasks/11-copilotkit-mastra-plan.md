# 11 · CopilotKit–Mastra reliability, memory and performance plan

**Status:** historical baseline + active B2/C milestones · **Original baseline (2026-11-05):** `36020745cfe81774c080bec57fef85acd7144a5a` (historical only; not current `main`/production). **20/20 product certification:** pinned `8114a5a96382`; later #787 merge was verified at `7c753cd6b1`. Check live SHAs before new work.

Related verified tasks: **SAN-1639 · Fix Chat History Going Blank After Navigation or Re-clicking a Saved Chat** (**Done**) and **SAN-1298 · EPIC · CopilotKit Upgrade — One Safe AI Pattern Across Every MDE Screen** (**Done**). These are complete for their recorded product milestone, not proof that every future release or B2/A4 follow-up is finished. Reuse existing tracking; create no duplicates.

> **Correction that governs everything below:** CopilotKit's `isReady` confirms the **real agent is connected**. It does **not** prove that saved-message replay has finished. Any change to the restore path must gate on *both* connection state and replay completion — never on `isReady` alone.

---

## 1 · Verified baseline

### 1.1 Dependency baseline (re-read from `package-lock.json` before every change)

| Package | Installed | Note |
|---|---|---|
| `@copilotkit/react-core` / `runtime` | **1.84.1** | v2 imports only (`/v2`) |
| `@ag-ui/client` / `@ag-ui/core` | **1.0.2** | transport contract |
| `@ag-ui/mastra` | **2.0.2** | `LoggingMastraAgent` extends `MastraAgent` |
| `@mastra/core` | **1.81.0** | stable family |
| `@mastra/memory` / `@mastra/pg` | **1.40.0** / **1.34.0** | Postgres storage, RLS + FORCE RLS |
| `ai` | 6.0.185 | AI SDK v6 line |

The `mastra` skill's version snapshot (1.74.0 / 1.35.0 / 1.1.6) is **stale**; `package.json` and the lockfile above are authoritative. Update that snapshot in the same PR when the family next moves.

⚠️ The main checkout `/home/sk/mdeai` is on branch `docs/san-1638-merge-history` with **pre-upgrade pins** (CopilotKit 1.75.0, `@ag-ui/client` 0.0.59, Mastra 1.74.0). Never run tests there and treat the results as production truth. All work must use a clean worktree at `origin/main`.

### 1.2 What works (verified on `36020745cfe8`)

- Cross-screen journey: **18/20** journeys passed (mobile **10/10**, desktop 8/10), zero product-assertion failures, zero unexpected skips.
- Re-clicking the active conversation keeps its history (`chat-nav-rail.tsx` `displayedThreadId` guard + `thread-nav-context.tsx` same-id guard, merged in #758).
- History re-renders after Chat → Rentals → Events → Chat in every completed journey.
- Follow-ups continue the same thread and persist.
- The harness can no longer report success for a failed run: `assessTurn`, `assessRunResponse`, `awaitRunResponse`, an owned completion promise, and 25 negative tests.
- 21 leaked QA accounts found and deleted; 0 remain.

### 1.3 What is broken or unproven

| Item | Evidence | Owner file |
|---|---|---|
| Saved-history restore is still timer-driven | `QUIET_RECONNECT_GRACE_MS = 2_500`, `RECONNECT_SETTLE_TIMEOUT_MS = 30_000`, `useAgent` without `isReady` | `src/components/chat/chat-provider.tsx` |
| Original blank-chat race never root-caused | symptom gone 18/18; mechanism unknown | same |
| Desktop journey 401 | `the run request failed with HTTP 401` on first send — session not established | `e2e/prod-cross-screen-journey.spec.ts` sign-in step |
| 60 s page readiness | one-off; the page never became usable | unknown boundary |
| `TypeError: network error` | one-off mid-run; **not** proven to be Gemini | unknown boundary |
| Maps configuration | `Google Maps … Unable to fetch configuration for mapId`; CI logs `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID missing — using DEMO_MAP_ID` | deployment config |
| Working-memory concurrency | lock is per-process only | `src/mastra/lib/agent-memory.ts` |
| Runtime built per request | `buildHandler` → `new CopilotRuntime` per request | `src/app/api/copilotkit/[[...path]]/route.ts` |
| QA cleanup on kill | a killed run skips `finally` → leaked account | `e2e/prod-cross-screen-journey.spec.ts` |

---

## 2 · Milestone A — reliability (first; blocks SAN-1639)

### A1 · Saved-conversation restoration (highest priority)

**Problem.** Restoration depends on two timers plus a late `setMessages()` replay. It passes 18/18 today, but the mechanism was never proven, so the failure can return silently.

**Evidence.** `chat-provider.tsx:107` subscribes `useAgent({ agentId, updates: [UseAgentUpdate.OnRunStatusChanged] })` and discards `isReady`. `watchConnectCycle` resolves `done | timeout | aborted`. Restore path: fetch `/api/threads/{id}/messages` → race reconnect against `QUIET_RECONNECT_GRACE_MS` → `reconcileSavedHistory` → `agent.setMessages`.

**Reference → adaptation.**

| Reference | Source | Disposition | Destination |
|---|---|---|---|
| CopilotKit v2 `useAgent` | https://docs.copilotkit.ai/reference/v2/hooks/useAgent | **ADAPT** `isReady` + `OnMessagesChanged` | `src/components/chat/chat-provider.tsx` |
| CopilotKit v2 source (v1.84.1) | `packages/react-core/src/v2/hooks/use-agent.tsx` | **REFERENCE ONLY** — provisional-agent swap semantics | — |
| AG-UI subscriber | https://docs.ag-ui.com/sdk/js/client/subscriber | **REFERENCE** — message/run completion events | — |
| React effects | https://react.dev/reference/react/useEffect | **ADAPT** cancellation and stale-response guards | same |

**Change (staged, reversible).**
1. **Readiness gating:** do not install saved messages while the agent is **provisional** (`isReady === false`); restart restoration when `isReady` flips true *and* the thread id still matches.
2. **Explicit replay-complete signal:** restoration is done when (a) history is fetched, (b) the real agent is connected, (c) `setMessages` was applied for this thread id. Timers remain the fallback until (a)–(c) are proven by tests.
3. Delete `QUIET_RECONNECT_GRACE_MS` / `RECONNECT_SETTLE_TIMEOUT_MS` **only** after deterministic tests cover: quiet reconnect (no connect at all), delayed reconnect, connect failure, cancellation on thread switch, Strict-Mode double effect.

**Tests.** Extend `src/components/__tests__/saved-thread-history-hydration.test.tsx` and `src/components/chat/__tests__/chat-provider-startup-race.test.tsx`. Required cases: provisional→real swap; late connect after grace; connect timeout; aborted restore; thread switch mid-restore; duplicate replay; **`isReady` true but replay unfinished must not mark done**.

**Acceptance.** History renders exactly once after refresh and after navigation; no wrong-thread messages; timers removed only with the tests above green.

### A2 · AI completion contract in tests

**Problem.** `waitForCopilotIdle` could report success before the run started, on an old answer, or on an HTTP failure. Fixed in #769 — keep it that way.

**Current contract.** `e2e/helpers/turn-completion.ts`: `assessTurn` measures reply growth from a baseline captured **before submit**; `assessRunResponse` treats null / 4xx / 5xx as failure; `awaitRunResponse` judges the status before awaiting the stream and surfaces the `Error` that `finished()` resolves with; `completion.catch()` is attached at creation.

**Remaining gap.** `assessTurn` returns `done` on `settled` even with **no** new reply, so a `200` carrying no answer counts as done to the helper and is only caught by later assertions. **Add** a `requireNewReply` option (or an explicit "answer rendered" assertion in `sendAndWait` callers) plus its test.

**Acceptance.** Tests distinguish agent failure from test-waiting failure; no timeout extension hides a real failure.

### A3 · Cross-screen matrix at 10/10

**Blocker.** Desktop 8/10: one `HTTP 401` (auth not established before the first send) and one Maps `503` console error.

**Change.** After `signInAsOnOrigin`, wait for an authenticated readiness signal before the first send (for example a `200` from an authenticated endpoint the suite already uses) instead of relying on a fixed sequence. Do **not** filter the console error — the Maps `503` is a real configuration signal.

**Acceptance.** 10/10 desktop and 10/10 mobile on one pinned SHA, zero retries.

### A4 · Cleanup that survives a killed run

**Problem.** A Playwright run killed at the timeout cap skips `finally`; one QA account leaked this way even after per-test cleanup.

**Change.** Add a suite-level sweep of disposable `qa-*` identities at the end of the run (bounded to the identity prefix this suite creates), verifying 0 remain. Reuse the existing `deleteThrowawayIdentity` primitives; no new deletion path for real users.

---

## 3 · Milestone B — investigation (evidence before change)

### B1 · 60 s page readiness

Measure cold vs warm: document response time, JS load and hydration, session initialisation, CopilotKit runtime readiness, saved-history restore, and the moment the composer becomes usable. Use Playwright timing, Vercel logs and existing diagnostics. **Fix only the demonstrated bottleneck** — no timeout increases, no speculative caches.

### B2 · `TypeError: network error`

Trace one failure end to end: browser request → `/api/copilotkit` → `@ag-ui/mastra` → Mastra agent → model/tool → stream → UI. Capture redacted timestamps, status, request failure reason, AG-UI terminal event and server error. **Do not attribute to Gemini without evidence.**

Both belong on existing issues; no duplicates.

---

## 4 · Milestone C — observability and performance (only after A)

### C1 · Lightweight end-to-end tracing

Inventory first: `persistTurnLog`, `logAgentRunForTurn`, the `ai_runs` audit, and any Mastra tracing configuration. Then correlate request → run → thread → agent → tool using existing identifiers. Reuse installed Mastra tracing; **add no second platform** and export nothing to a new hosted service. Never log prompts or private message bodies.

**Acceptance.** A failed rental search can be attributed to a specific boundary.

### C2 · Working-memory concurrency — measure before any change

MDE currently uses **thread-scoped** working memory and an in-process `workingMemoryLocks` promise chain in `src/mastra/lib/agent-memory.ts`. The special `selectedPinId: null` clear path performs a local read-modify-write and may lose concurrent updates **across separate instances**. This is a plausible concurrency risk, **not yet a reproduced incident**.

Mastra's native `mergeWorkingMemory()` is **not** a drop-in replacement: its documented atomic row-locked merge requires **schema-based, resource-scoped** working memory, a `resourceId`, and a supporting storage adapter such as `@mastra/pg`. MDE's memory scope is `thread`. The installed `supportsAtomicWorkingMemoryMerge()` capability does not override that scope requirement.

**Correct path:**
1. Reproduce (or rule out) the lost-update case using two concurrent writers on the **same thread**, including a `selectedPinId: null` clear; prove different threads do not interfere.
2. Preserve thread identity/isolation and existing schema semantics. Do not convert all memory to resource scope just for an optimization.
3. If a defect is proven, prefer a narrowly scoped atomic **thread-keyed** Postgres transaction/RPC or a supported adapter mechanism over new locking infrastructure. RLS, authorization, and private data stay unchanged.
4. Test concurrent writers, failures, retries and null-clearing on real database semantics; otherwise record the measured ceiling and make no speculative changes.

**Acceptance:** Either a measured safe baseline with documented limitations, or a proven minimal concurrency fix that preserves every field and thread boundary.

### C3 · Runtime initialization cost

Measure `buildHandler()` and `new CopilotRuntime(...)` per request (route line 102, called at 274). Hoist only **static, user-independent** objects. Agents, `resourceId`, `RequestContext`, authorization and run state stay per request. If it is already cheap, make no change.

---

## 5 · Ordering and rationale

| Order | Item | Why |
|---|---|---|
| 1 | A1 restoration gating | **Completed:** #777 merged; 20/20 certified at pinned `8114a5a96382` |
| 2 | A3 desktop 401 + matrix 10/10 | **Completed:** #787 merged; previous 20/20 evidence remains release-pinned |
| 3 | A2 `requireNewReply` | **Completed:** new nonempty answer assertion already present in #777; #780 closed as duplicate |
| 4 | A4 killed-run cleanup | **Almost complete:** #787 sweep, #792 test finalizer and #796 independent nightly job are merged; #800 closes the artifact-privacy finding |
| 5 | B1 / B2 | Two unowned production signals; measure before assigning |
| 6 | C1 tracing | Makes B1/B2 and future incidents cheap |
| 7 | C2 / C3 | Only after two-writer and initialization measurements; native atomic memory merge requires resource scope |

**Efficiency rules learned the hard way**

- Five review rounds hit **one 40-line helper**. Write pure decision functions with tables of cases first — they caught more than 20 live journeys did.
- A killed test skips `finally`; add a suite-level sweep.
- Pin `/api/version` before **and** after; production moved five times in one day.
- Never enlarge a timeout to make a suite pass. That is the failure mode this plan exists to remove.

---

## 6 · Success criteria (production readiness)

**Milestone A (reliability)**
1. `SavedThreadHistory` gated on connection **and** replay completion; timers removed with deterministic tests.
2. 10/10 desktop + 10/10 mobile journeys on one pinned SHA, zero retries.
3. No leaked QA identities after a matrix run, including a killed run.
4. `floor` green; zero unresolved review findings.

**Milestone B (diagnosis)**
5. 60 s readiness explained and fixed, or explicitly accepted with numbers.
6. `network error` attributed to a named boundary with evidence.

**Milestone C (improvement)**
7. A failed search is traceable to a component without exposing private content.
8. Working-memory concurrency proven safe or fixed minimally.
9. Runtime initialization measured; changed only if material.

**Explicitly out of scope:** new memory engine, second chat service, second tracing platform, framework upgrade, hosted Intelligence, and any business/approval gate that blocks Phase A development.

---

## 7 · Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | Removing timers reintroduces the blank chat | Remove only with the A1 test matrix green |
| 2 | `isReady` mistaken for replay-complete | Two-signal gate plus an explicit replay-complete flag |
| 3 | Desktop 401 dismissed as a flake | Authenticated readiness before the first send |
| 4 | Maps `503` filtered away as noise | Treat as a configuration finding |
| 5 | Production SHA drift mid-run | Pin before/after; split results by SHA |
| 6 | Stale checkout produces false evidence | Always a clean worktree at `origin/main` |

---

## 8 · Source receipts — official references per fix

Every URL below was **fetched and verified to return HTTP 200** on 2026-11-05 (not quoted from memory). Dispositions follow the repository evidence rules.

### A1 · Saved-history restore gating

| URL | Source | Decision | Disposition |
|---|---|---|---|
| https://docs.copilotkit.ai/reference/hooks/useAgent | `useAgent` reference — `isReady` and agent lifecycle | what `isReady` actually guarantees | **ADAPT** → `src/components/chat/chat-provider.tsx` |
| https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/packages/react-core/src/v2/hooks/use-agent.tsx | installed-tag source, lines 256–320: provisional agent returns `isReady: false`, registered agent returns `true` | proves `isReady` ≠ replay-complete | **REFERENCE ONLY** (confirmed in MCP `explore-code`) |
| https://docs.copilotkit.ai/reference/hooks/useThreads | thread list/replay surface | existing thread APIs, don't add a second history store | **REFERENCE ONLY** |
| https://docs.copilotkit.ai/reference/hooks/useCopilotKit | provider/runtime access | provider contracts stay stable | **REFERENCE ONLY** |
| https://docs.ag-ui.com/concepts/events | `RUN_STARTED` / `RUN_FINISHED` / `RUN_ERROR` | which event proves a run ended vs failed | **ADAPT** → restore/`waitForCopilotIdle` gating |
| https://react.dev/reference/react/useEffect | effect cancellation, stale responses | abort pattern for the restore effect | **ADAPT** → same file |

### A2 · AI completion contract (tests)

| URL | Source | Decision | Disposition |
|---|---|---|---|
| https://playwright.dev/docs/api/class-request | `request.response()` is `null` when no response arrives | a missing response is a failure | **ADAPT** → `e2e/helpers/turn-completion.ts` |
| https://playwright.dev/docs/api/class-response | `response.finished()` **resolves with an `Error`**, and resolves for 4xx/5xx | status must be judged separately; resolved Error must be raised | **ADAPT** → `awaitRunResponse` |
| https://docs.ag-ui.com/concepts/events | terminal run events | distinguish agent failure from test-waiting failure | **ADAPT** → `waitForCopilotIdle` |
| https://playwright.dev/docs/test-assertions | web-first assertions, polling semantics | why `toHaveCount(1)` cannot detect a dip; use continuous sampling | **ADAPT** → journey observer |

### A3 · Desktop 401 / matrix 10/10

| URL | Source | Decision | Disposition |
|---|---|---|---|
| https://playwright.dev/docs/auth | reusable auth state, per-test identity isolation | authenticated readiness before first send; per-test identity | **ADAPT** → `e2e/prod-cross-screen-journey.spec.ts` |
| https://playwright.dev/docs/api/class-test | `afterEach` runs per test, `afterAll` once per worker | per-test cleanup ownership | **ADAPT** → same spec |

### A4 · Cleanup that survives a killed run

| URL | Source | Decision | Disposition |
|---|---|---|---|
| https://playwright.dev/docs/api/class-test | hook semantics and teardown ordering | a killed run skips `finally`; add a suite-level sweep | **ADAPT** → spec teardown |

### B1 / B2 · Investigations

| URL | Source | Decision | Disposition |
|---|---|---|---|
| https://vercel.com/docs/observability/logs | runtime/function logs for the boundary | measure server-side before assigning blame | **REFERENCE ONLY** |
| https://playwright.dev/docs/network | request/response lifecycle capture | capture status + failure reason per request | **ADAPT** → diagnostic run |
| https://mastra.ai/docs/observability/logging | structured logs correlated to traces | reuse existing logging; no new platform | **REFERENCE ONLY** |
| https://docs.ag-ui.com/sdk/js/client/abstract-agent | agent run lifecycle | where a run can fail before the UI sees it | **REFERENCE ONLY** |

### C1 · End-to-end tracing

| URL | Source | Decision | Disposition |
|---|---|---|---|
| https://mastra.ai/docs/observability/overview | Observability config, exporters, `SensitiveDataFilter`, serverless `flush()` | reuse Mastra observability; no second platform | **REFERENCE ONLY** |
| https://mastra.ai/docs/observability/tracing/overview | span/trace correlation and sampling | correlate request → run → tool with existing ids | **REFERENCE ONLY** |
| https://mastra.ai/docs/observability/logging | log↔trace correlation | link existing turn logs to traces | **REFERENCE ONLY** |

### C2 · Working-memory concurrency (findings above already cite this)

| URL | Source | Decision | Disposition |
|---|---|---|---|
| https://mastra.ai/docs/memory/working-memory | Resource-scoped, schema-based memory uses row-locked atomic merge on supported storage | **Not** a drop-in for MDE's thread scope; test two-writer issue first | **REFERENCE ONLY** → `src/mastra/lib/agent-memory.ts` |
| https://mastra.ai/reference/memory/memory-class | `mergeWorkingMemory`, `supportsAtomicWorkingMemoryMerge` | check current scope requirements before changing code | **REFERENCE ONLY** |
| https://mastra.ai/reference/storage/overview | `@mastra/pg` storage capabilities | confirm the adapter supports atomic merge | **REFERENCE ONLY** |
| https://supabase.com/docs/guides/database/postgres/row-level-security | RLS expectations for the same database | no RLS change is involved; do not weaken it | **REFERENCE ONLY** |

### C3 · Runtime initialization cost

| URL | Source | Decision | Disposition |
|---|---|---|---|
| https://nextjs.org/docs/app/building-your-application/routing/route-handlers | route-handler execution model | what is per-request vs module-scope | **REFERENCE ONLY** (measure first) |
| https://github.com/CopilotKit/CopilotKit/tree/v1.84.1/packages/react-core/src/v2/hooks | v2 hooks surface at the installed tag | confirm no API drift before touching the runtime | **REFERENCE ONLY** |

### Operations / delivery

| URL | Source | Decision | Disposition |
|---|---|---|---|
| https://vercel.com/docs/deployments/promoting-a-deployment | staged promotion | promote only a verified deployment; never an unverified candidate | **REFERENCE ONLY** |
| https://git-scm.com/docs/git-worktree | worktree add/remove/prune | safe cleanup of temporary worktrees | **ADAPT** → cleanup step |
| https://playwright.dev/docs/best-practices | test design, no arbitrary waits | harness rules already enforced by `playwright-architecture-contract` | **REFERENCE ONLY** |

### Rejected references (recorded so they are not retried)

| Candidate | Why rejected |
|---|---|
| `https://mastra.ai/reference/storage/postgres` | **404** — the real page is `reference/storage/overview` |
| `https://docs.copilotkit.ai/reference/v2/hooks/useCopilotChat` | **404** — no such v2 page; use `useAgent`, `useThreads`, `useCopilotKit` |
| Mastra **local-package** tools via `mastra_docs` MCP | `getMastraExports` fails with *"No SOURCE_MAP.json found"*; read `node_modules/@mastra/*/dist/*.d.ts` instead |
| CopilotKit **semantic search** via `copilotkit` MCP | every `search-*` tool returns *"Search failed"*; use `explore-code` / `explore-docs` |

**Known-bad MCP claim:** `mastra_docs.listMastraPackages` reports `@mastra/mcp` as installed; it is **not** in `node_modules/@mastra` on this checkout.

---

## 9 · Live progress — tracked in `12-steps.md`

Step-by-step status lives in [`12-steps.md`](./12-steps.md) and is the file to update as work lands. Summary as of 2026-11-05:

| Step | Status | PR / evidence |
|---|---|---|
| 0 · Prep + SHA pinning | ✅ | worktree `/home/sk/.worktrees/mde-ai-rel`; prod pinned per batch |
| A1 · Restore gated on `isReady` | ✅ **certified 20/20** | [#777](https://github.com/amoai-tech/mdeai/pull/777) merged; **20 journeys** on pinned `8114a5a96382` (10 desktop + 10 mobile, 0 retries/skips/flaky) |
| A1 duplicate | ✅ closed | [#779](https://github.com/amoai-tech/mdeai/pull/779) — one defect, one PR |
| A2 · No answer ≠ success | ✅ already in main | `sendAndWait` asserts a NEW nonempty reply; [#780](https://github.com/amoai-tech/mdeai/pull/780) **closed** as superseded |
| A3 · First-send 401 | ✅ | readiness requires HTTP 200 from the runtime info probe; shipped in #787 |
| A4 · Killed-run cleanup | 🟡 | #787 ownership sweep + #792 failed-test error reporting + #796 independent nightly job all merged; #800 closes the artifact-privacy finding |
| B1 · 60 s readiness | 🟡 measured | 5 loads: **0.46–1.73 s** to an enabled composer; the 60 s stall did not reproduce |
| B2 · `network error` | ⬜ | unowned; **not** proven to be Gemini |
| C1 · Tracing | ⬜ | — |
| C2 · Working-memory concurrency | ⬜ | two-writer defect unproven; native atomic API requires resource scope, current MDE memory is thread-scoped |
| C3 · Runtime init | ⬜ | unmeasured |
| Support · CopilotKit skill fallback | 🟡 | [#778](https://github.com/amoai-tech/mdeai/pull/778) open |

**Product milestone achieved:** 20/20 desktop+mobile at pinned `8114a5a96382`; SAN-1639 and SAN-1298 are Done. **Next:** close #798/#800/#801; instrument the answer stream for B2; add a run-owner lease instead of the 2-hour age check. No need to repeat the product matrix for docs-only changes.

