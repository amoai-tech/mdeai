# SAN-1588 · NVIDIA model reliability and real-user proof — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MDE's optional NVIDIA inference reliable in the existing CopilotKit → Mastra → Supabase application, and prove one real rental viewing transaction without adding duplicate services.

**Architecture:** Keep `src/lib/ai-provider.ts` as the server-only model adapter, `src/mastra/lib/models.ts` as the shared agent model owner and the existing signed-in CopilotKit runtime. Bound provider and whole-turn time, reuse the existing rental tools/RPC and record truthful model telemetry. Gemini remains reversible, and NVIDIA is NOT promoted as default until capability, latency, terms and end-to-end proof are satisfactory.

**Tech Stack:** Next.js 16, TypeScript, `@mastra/core@1.74.0`, CopilotKit, AI SDK LanguageModelV2, `@ai-sdk/openai-compatible@1.0.39`, Vitest, Playwright, Supabase Postgres/RLS/pgvector.

**Spec:** https://linear.app/amo100/issue/SAN-1588 ; related https://linear.app/amo100/issue/SAN-1536 , https://linear.app/amo100/issue/SAN-1394 , https://linear.app/amo100/issue/SAN-1522 .

## Global Constraints

- **Phase A only.** No verification, ownership, photo-rights, approvals, publication, viewing/booking eligibility or freshness gates. Keep security, audit, valid DB transactions, RLS and idempotency.
- Reuse existing agents, tools, Maps, `leads` and `showings`, CopilotKit route, embeddings and search. No new schema or engine.
- Preserve server-only `NVIDIA_API_KEY`, `MDE_AI_PROVIDER` opt-in, live-test opt-in and Gemini rollback. Never commit credentials.
- MDE's pinned Mastra registry does not include the desired native model router ID: preserve the working AI SDK `LanguageModelV2` adapter instead of upgrading Mastra within SAN-1588.
- Cost provenance: unknown NVIDIA USD price must not be reported as measured real spend or fabricated $0.
- `src/app/api/copilotkit/[[...path]]/route.ts` currently declares `maxDuration = 30`. A *per-call* 25 s limit alone does **not** guarantee a whole multi-step turn finishes within 30 s. Account for the route's whole-turn budget and tool/DB overhead.
- Current branch at plan creation: `ai/san-1588-mde-ai-add-nvidia-nemotron-to-chat-and-rental-search-without`, `54319eec62`. Branch diverged from main (1 ahead, 1 behind); unrelated untracked `.release-285/` and `.release-main/` must be left untouched. PR #387 for SAN-1536 is open.

## Review Focus

1. Caller signal and provider timeout fire together: own timeout must still work when an external `AbortSignal` is supplied. Test both precedence cases in Task 1.
2. Partial streaming that stalls after first token must time out; test a stream whose first token arrives then hangs in Task 1.
3. Multi-call agent turn approaches its total deadline: no second model call should restart a full 25 s budget. Test in Task 1.
4. Duplicate viewing submissions/retries cannot create two `leads` or `showings`; test in Task 2.
5. Cross-user/broker access must be denied under real authenticated policies even though development business approvals are absent; test in Task 2.

---

### Task 1: Bound NVIDIA latency and preserve error identity [SAN-1588, P0]

**Files:** Modify `src/lib/ai-provider.ts`, `src/mastra/lib/mastra-telemetry.ts`, `.env.example`; add or extend `src/lib/__tests__/ai-provider.test.ts`, `src/mastra/lib/models.provider.test.ts`, `src/mastra/lib/nvidia-model.integration.test.ts`. If the whole-turn deadline cannot be imposed in the existing agent wrapper, make the smallest bounded change to the existing CopilotKit runtime at `src/app/api/copilotkit/[[...path]]/route.ts` after reproducing that need.

**Interfaces:** `nvidiaTimeoutMs(): number` reads `MDE_NVIDIA_TIMEOUT_MS` with a documented default (candidate 25,000 ms, strict bounds), `withCallTimeout(model: LanguageModelV2, timeoutMs: number): LanguageModelV2` returns the same model contract and forwards the combined abort signal. A deadline marker differentiates provider timeouts from user aborts. Do not add a second model runner.

- [ ] Write deterministic failing tests for stalled `doGenerate`, stalled `doStream` **after** first chunk, caller cancellation, provider timeout with caller signal, complete stream, and multi-step turn budget.
- [ ] Run targeted Vitest: expect the new regressions to FAIL with today's unbounded provider.
- [ ] Add abort propagation covering creation/consumption of streaming results. Ensure timers are cleared on successful completion, abort and stream cancellation; preserve `finish` usage capture.
- [ ] Classify internally-created timeout as `error_type='timeout'` **before** generic `AbortError` / `client_abort` while retaining the distinction when the user navigates away.
- [ ] Return an honest, user-actionable 'temporarily unavailable / retry' error; do not fabricate search/booking success and do not blindly retry a side-effecting tool.
- [ ] Document env setting and run focused tests; then run `npm run typecheck` and lint on changed files.
- [ ] Commit only owned files, do not include unrelated release directories.

**Acceptance:** A deliberately hung model terminates inside the configured bound, including while streaming; no leaked timer, duplicate tool call, dangling work or mislabeled timeout. Whole CopilotKit turn respects the 30 s route ceiling (including tool/DB overhead).

### Task 2: One real signed-in rental-to-viewing journey [SAN-1588, P0]

**Files:** Prefer existing Playwright helpers and `e2e/san-1204-broker-viewing-requests.spec.ts`; create `e2e/san-1588-nvidia-rental-journey.spec.ts` only where it adds integration coverage. Production DB entities verified read-only: `public.leads(id,user_id,apartment_id,listing_id,idempotency_key,assigned_agent_id,...)`, `public.showings(id,lead_id,apartment_id,scheduled_at,...)`.

- [ ] Read existing QA sign-in helper, rental search/cards/Maps and viewing action test conventions. Set the actual NVIDIA provider and authenticated QA user only in server env.
- [ ] Write a failing browser journey for '2 bedrooms in Laureles under COP 3,000,000 per month' → existing chat → grounded cards/pins → Details → Schedule Viewing and persisted feedback.
- [ ] Use already-staged, truthfully labeled development listings, or explicitly skip when no grounded matching record exists; do not make up pins/availability.
- [ ] Verify **one lead + one showing** linked to the right `lead_id` and `apartment_id`, broker visibility and correct renter status. Repeat the same action and verify no duplicate rows.
- [ ] Test another authenticated user cannot read the private lead/showing and an unauthenticated user cannot execute the privileged action.
- [ ] Execute cleanup of only test-created records and re-query to verify removal; never assert unknown count as zero.
- [ ] Run `npm run test:e2e:qa-signin` plus this focused spec, report actual browser, HTTP, data rows and failures.

**Acceptance:** Real browser → API → persisted DB proof; 390px viewport smoke; per-user isolation; no Phase B eligibility gates.

### Task 3: One consistent Gemini live-test gate [SAN-1536, P0/maintenance]

**Files:** `src/mastra/lib/models.test.ts` only; coordinate PR https://github.com/amoai-tech/mdeai/pull/387 (open at review). Existing SAN-1588 branch duplicates its gate.

- [ ] Verify latest PR #387 head and required checks against current main. Prefer merging the single-purpose fix first.
- [ ] Rebase SAN-1588 after #387, resolve any overlapping hunk *once*, retain `MDE_RUN_LIVE_GEMINI_CAPABILITY_TESTS=1`, and keep the NVIDIA live flag separate.
- [ ] Run normal Vitest with/without key: no billable calls. Run live mode only with explicit paid credentials; if opted in without key, fail clearly.
- [ ] Update both Linear issues with ownership and PR links; mark whichever change truly landed, not merely duplicated.

**Acceptance:** Deterministic CI with depleted Google credits; one canonical implementation; no hidden live traffic.

### Task 4: Dependency and cost-truth cleanup [SAN-1394 + SAN-1588, P1]

**Files:** `package.json`, `package-lock.json`, `src/mastra/lib/token-usage-middleware.ts` (only if API spec changes), `src/mastra/lib/model-cost.ts`, `src/mastra/lib/mastra-telemetry.ts`, respective tests and any dashboard that displays `estimated_cost_usd`.

- [ ] Run `npm ls ai @ai-sdk/provider @ai-sdk/google @ai-sdk/openai-compatible @mastra/core @copilotkit/runtime`; record direct-vs-transitive ownership before upgrades.
- [ ] Declare `ai` and `@ai-sdk/provider` directly at *installed compatible* versions if imported by production code. Avoid a speculative `@ai-sdk/google` V3/V4 update inside SAN-1588.
- [ ] Verify the Google/NVIDIA models still implement the middleware's `LanguageModelV2` contract. Add compile/provider tests for a future spec upgrade under SAN-1394.
- [ ] Write a failing cost-truth test: an unknown NVIDIA rate cannot appear as a verified Gemini-derived USD spend. Record cost as unknown/null or clearly separate an *assumed* estimate, adjusting consumers safely. Keep known-priced Gemini math unchanged.
- [ ] Fix the 800 ms classifier signal composition in `src/lib/flash-route-classifier.ts` using combined caller and timeout signals; test caller-signal-present timeout. Keep regex fallback authoritative and NVIDIA out of the 800 ms path.
- [ ] Restrict `MDE_NVIDIA_REASONING_EFFORT` to NVIDIA's documented `none|low|high` (https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b-infer). Current `nvidiaReasoningEffort()` accepts `medium`, which the model's documented enum does not. Add explicit rejection/serialization tests in `src/lib/__tests__/ai-provider.test.ts`.
- [ ] Decide whether dead `src/lib/rental-intent-gemini.ts` adds real value; remove it and its test if unused rather than wiring another LLM pass without demonstrated benefit.
- [ ] Verify targeted tests, `npm run typecheck`, lint, and dependency-tree integrity; commit independently if the reviewer can reasonably approve this without the NVIDIA runtime changes.

**Acceptance:** No undeclared runtime dependency; compatible provider/middleware spec; no misleading spend figure; reliable fast-router timeout.

### Task 5: Real assistant coverage, operational decision, PR [SAN-1588, P1]

**Files:** Reuse existing CopilotKit UI/routes and existing event/concierge Playwright specs. Modify `scripts/check-env-contract.mjs`, `scripts/vercel-release-control.mjs`, `scripts/__tests__/vercel-release-control.test.mjs` together **only if** a NVIDIA production rollout is chosen.

- [ ] Add an authenticated concierge tourist turn: actual restaurant/place retrieval → grounded cards/pins with correct provenance; verify no invented data.
- [ ] Add authenticated event/host turn: draft → explicit user commit → persisted event, reuse existing Mastra tool. Ticketing/payment workflows stay under their own tasks, not a model-provider PR.
- [ ] Benchmark Super VL and the documented Lightning model on *identical* prompts; record success, p50/p95, timeout rates, actual budget/tool slots and price provenance. Do not assume a small model meets tools or 800 ms.
- [ ] Resolve real NVIDIA paid/commercial terms and available provider capacity separately from working development. Do not use trial access as production proof. Keep `MDE_AI_PROVIDER=gemini` as default/rollback unless live capability and billing are ready.
- [ ] Update branch from current main without overwriting other work; open focused PR with diff, exact tested SHA, risk/rollback and Linear links. Run `npm run floor` (plus applicable Playwright/DB probes) and review comments; verify CI at PR head. Main may currently have an unrelated event-search clock test PR #508; do not silently bundle it.
- [ ] Update SAN-1588 state only from verified evidence: In Progress → In Review when PR exists → Done after required journeys, runtime bounds and PR outcome.

**Acceptance:** End-to-end rental journey proven, concierge/event assistant cases evaluated, CI and runtime error path reliable; no duplicate agents, tools, SQL tables or unjustified Phase A business rules.

### Task 6: Keep PR-Agent separate [SAN-1522, separate follow-up]

**Files:** Existing PR-Agent workflow/scripts and review-state verifier **only**, never `src/mastra/agents/**` merely for PR-Agent.

- [ ] Inspect latest PR-Agent deployment source, review-completeness state and skips (especially partial review flagged green); confirm checks are pinned to the PR head and actual review completion.
- [ ] Reproduce on one representative medium and one large PR; a review with excluded files must not claim complete.
- [ ] Keep PR-Agent quotas/secrets isolated from MDE renter chat. Update SAN-1522 with before/after review coverage proof.

**Acceptance:** PR-Agent reviews do not return false-green on incomplete coverage, without influencing customer-facing model routing.

## Scope boundary: OpenBot, OpenMuse, OpenDots

These are independently evolving agent products, not missing dependencies for a provider swap. Do not install or embed as part of SAN-1588. OpenMuse (https://github.com/CopilotKit/OpenMuse) is a possible *future* reference for persistent cross-platform assistant UX; OpenBot (https://openbot.run/) and OpenDots (https://github.com/Shashankss1205/OpenDots) are optional agent-workspace/continuous-goal inspirations. Compare them only under a separate product-outcome need with grounded integration requirements.

## Documentation map

- NVIDIA chat API: https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b-infer — direct model ID, `reasoning_effort`, stream and tools; validate through current adapter.
- AI SDK provider: https://ai-sdk.dev/providers/openai-compatible-providers/nim — official existing adapter; no Mastra registry upgrade necessary.
- Mastra model catalog: https://mastra.ai/models/providers/nvidia — catalog string is **not** installed model support proof on pinned version.
- CopilotKit/Mastra: https://docs.copilotkit.ai/mastra — reuse authenticated AG-UI route and generative UI.
- Supabase RLS + vector: https://supabase.com/docs/guides/ai/rag-with-permissions and https://supabase.com/docs/guides/database/extensions/pgvector — keep existing RLS/retrieval sources, no schema migration.

## Evidence and decision record (2026-10-22)

- Verified local branch `54319eec62`, 16 changed files, one behind current main; no SAN-1588 PR located. Untracked release dirs exist but are unrelated.
- Fresh focused Vitest: **3 files, 19 passed, 2 skipped**; billable live tests were not exercised in this run. Earlier report said 3419/3419 deterministic tests; this is historical evidence and must not be presented as a fresh full gate.
- Read-only live Supabase confirmed `public.ai_runs`, `public.leads`, `public.showings`, `listing_embeddings`, `restaurant_embeddings` and SELECT RLS policies. No test transaction was executed.
- Previously reported NVIDIA latency ranged from ~1s to >69s, with a hang over 4 minutes; these need current benchmark verification. No currently proven full signed-in journey.

**Final gate:** Dev working journey, real persistence and safe timeout first. Public-launch business certification remains separate and must not obstruct Phase A development.
