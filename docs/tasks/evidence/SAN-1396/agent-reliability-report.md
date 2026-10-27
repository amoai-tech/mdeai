# SAN-1396 — Test and Monitor MDE Host, Events and Concierge AI Reliability

Run date: 2026-10-27 · Original QA worktree: `feat/san-983-982-984-515-event-ops` · PR implementation now on `fix/san-1396-agent-error-recovery` · Production at test time: `da3fe972283483bfb925002464710728596d4ec0` (`/api/version`)

## 1. Bottom line

**Not production-certified yet. Score: 72 / 100.**

The code fix and tests are done and green locally. The fix is **not deployed** until the PR merges. Host Ops and the Host Event Wizard now have live browser proof at phone and desktop width. The Events agent has none (it has no screen), publishing from the wizard was deliberately not tested on production, and one Concierge test was flaky.

| Plain-language result | Who it affects |
| --- | --- |
| Only the Concierge could recover from Gemini's "bad function call" glitch. Host Ops, the Host Event Wizard and the Events agent could not. Now all four share the same safe, one-time retry. | Hosts (Roberto-type organizers) saw a hard error where the Concierge would have quietly retried. |
| The retry never repeats a saved action. Proven by tests where the glitch hits after a tool already ran. | Protects against duplicate events / duplicate saves. |
| Host Ops chat works live on production at phone size, restores after reload, and refuses other users (HTTP 403 / 401). | Hosts' private sales data stays private. |
| Historical **mixed-environment** ai_runs outcomes (not a production-only failure rate): Concierge 97.2% (213 runs), Host Event Wizard 97.1% (171 runs), Host Ops 100% but only 2 runs, Events agent 0 runs. | The Events agent has no screen that uses it; event search runs through the Concierge. |

## 2. Scorecard

| Agent | Working | Broken / gap | Tests passed | Missing | Fix made | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| **Concierge** (`conciergeAgent`) | Retry already present; 97.2% of 213 runs OK (14 d); live isolation + thread tests pass | 1 live test failed once, passed on retry (see §6) | Unit 7 + integration 3 + matrix 12; prod 12/13 first try | Cause of the one flaky "New Chat while streaming" failure | None needed | Re-run that test 10× after deploy; diagnose if it fails again |
| **Host Ops** (`hostOpsAgent`) | Live prod chat OK: first message, reload restore, foreign user 403, anonymous 401. Sales numbers match the database at 390 px and 1440 px | No recovery before this change | Matrix + wiring pass; live SAN-1209 pass; live sales-accuracy 4/4 | Nothing open for this agent | Retry processor wired in | Re-run `host-ai-sales-accuracy.spec.ts` after deploy |
| **Host Event Wizard** (`hostEventAgent`) | 97.1% of 171 runs OK. Has **no tools**, so the agent itself cannot write a duplicate. | No recovery before this change. 4 of 5 logged failures are database/connection errors (§5) | Matrix + wiring pass; live form-fill 4/4 at 390 / 1440 px | Approve → publish → one persisted event (publishing makes a public event on production, so it was not run) | Retry processor wired in | Run the publish step on a local or preview database, or approve a short-lived public test event |
| **Events Discovery** (`eventAgent`) | Registered in Mastra | **No UI entry point; 0 production runs.** Event search for visitors runs through the Concierge's events tool. | Matrix + wiring pass | Any live journey | Retry processor wired in | Decide: remove it, or connect it. Do not test a screen that does not exist |

## 3. What was changed

| File | Change |
| --- | --- |
| [src/mastra/agents/host-ops.ts](../../../../src/mastra/agents/host-ops.ts) | Adds `errorProcessors: [geminiMalformedFirstStepRetry]` |
| [src/mastra/agents/host-event.ts](../../../../src/mastra/agents/host-event.ts) | Same |
| [src/mastra/agents/event-agent.ts](../../../../src/mastra/agents/event-agent.ts) | Same |
| [src/mastra/lib/gemini-malformed-retry.ts](../../../../src/mastra/lib/gemini-malformed-retry.ts) | One structured log line per decision (`retry`, `refused_tool_ran`, `refused_unidentified_message`) with agent, model, deploy SHA, timestamp. No message text. The retry decision is also joined to the same ai_runs.metadata row as the final transport outcome through RequestContext; Vercel logging remains diagnostic, not the measurement source. |
| [src/mastra/lib/mastra-telemetry.ts](../../../../src/mastra/lib/mastra-telemetry.ts) | Gemini generation faults (`MALFORMED_FUNCTION_CALL`, `AI_APICallError`, `AI_LoadAPIKeyError`) now classify as `model_failure` instead of `unknown` |
| [src/mastra/agents/__tests__/agent-failure-matrix.test.ts](../../../../src/mastra/agents/__tests__/agent-failure-matrix.test.ts) | New shared matrix: 4 wiring checks + 8 injected failures |
| [gemini-malformed-retry.test.ts](../../../../src/mastra/lib/__tests__/gemini-malformed-retry.test.ts), [mastra-telemetry.test.ts](../../../../src/mastra/lib/mastra-telemetry.test.ts) | Log-shape and classifier assertions |

No new runtime, no new model, no backup provider, no database change.

## 4. Test evidence

**Red → green.** Before the fix, the new wiring test failed for exactly 3 agents (`hostOpsAgent`, `hostEventAgent`, `eventAgent`); after, all 12 matrix tests pass.

| Layer | Command | Result |
| --- | --- | --- |
| Focused (Mastra agents + lib) | `npx vitest run src/mastra/agents src/mastra/lib` | 53 files passed, 369 tests passed, 25 skipped (live-DB / NVIDIA integration tests, skipped by design) |
| Lint, changed files | `npx eslint --max-warnings 0 …` | clean |
| Typecheck | `npx tsc --noEmit` | clean |
| Full gate | `npm run floor` | **exit 0**; 486 files / 3,774 tests passed, 35 skipped; build, Mastra schema contract (32 tables) OK |
| Live prod: Host Ops | `playwright … e2e/app/host-ai-continuity.spec.ts --project=prod-smoke` | 1 passed (20 s). Thread restored, ≥2 messages saved, foreign user 403, anonymous 401, 390 px |
| Live prod: isolation + Concierge threads | `… prod-copilotkit-isolation.spec.ts prod-concierge-thread-lifecycle.spec.ts` | 12 passed, 1 flaky (failed once, passed on retry) |
| Live prod: Host Ops sales accuracy (new) | `playwright … e2e/app/host-ai-sales-accuracy.spec.ts -g "Host Ops"` | 2 passed per run (390 px, 1440 px), 4 of 4 over two runs. Seeded 1 draft event, 1 paid order of 180,000 cents, 2 tickets. Reply said "2 tickets … 1 paid order … COP 1,800 … 20% sold" and named the event; the follow-up "Which event is that for?" named it correctly. |
| Live prod: Host Event Wizard fill (new) | same file, `-g "Wizard"` | 4 of 4 passed over two runs (390 px, 1440 px). Asking for a titled event in Laureles with capacity 80 filled title, neighborhood and capacity; **zero** `events` rows written for the host (nothing is saved until the host approves). |
| Live prod: flaky test repeated | `… -g "New Chat while a reply is still streaming" --repeat-each=3 --retries=0` | 3 / 3 passed |
| QA cleanup | Re-query of auth users, `mastra_threads` and events with slug `qa-san1396*` | **0, 0 and 0** left behind after every run |

### Injected-failure matrix (mock Gemini model, real Mastra agent loop)

| ID | Injected failure | Observed result | Verdict |
| --- | --- | --- | --- |
| F1 | Malformed call on first step | 1 retry, answer returned (2 model calls) | Pass |
| F2 | Malformed call twice | Stops after 1 retry, real error shown (2 calls) | Pass: bounded |
| F3 | Malformed call **after** a tool ran | No retry, tool ran once (1 call) | Pass: no duplicate |
| F429 | HTTP 429 (retryable) | Mastra's built-in handling recovers (2 calls) | Pass |
| F503 | HTTP 503 (retryable) | Recovers (2 calls) | Pass |
| F-timeout | Timeout | Honest `TimeoutError`, 1 call, no fake answer | Pass |
| F-interrupted | Connection cut mid-text | Mastra retries 3×, then error surfaces, no tool ran | Pass: bounded |
| F-tool-then-cut | Connection cut after a tool call | Tool ran at most once | Pass (see limit below) |

**Limit:** these use a mock model, so they prove our error handling, not Google's behaviour. F-tool-then-cut shows "at most once", not which attempt ran the tool.

## 5. Production monitoring (existing `ai_runs` table, 14 days, read-only)

The existing logger already records status, error type, duration and model for every turn, so no new table was added.

| Agent | Runs | Success | p50 / p95 | Failures |
| --- | --- | --- | --- | --- |
| concierge-agent | 213 | 97.2% | 2.5 s / 10.7 s | 6 |
| host-event-agent | 171 | 97.1% | 1.1 s / 3.6 s | 5 |
| host-ops-agent | 2 | 100% | 2.9 s | 0 |
| event-agent | 0 | n/a | n/a | n/a |
| partner-agent | 1 | 0% | n/a | 1 (API key missing) |

Failure causes in those 12 failed turns: missing Google key ×3, database connection/auth ×5 (`password authentication failed` ×2, `ENOTFOUND` ×1, `ENETUNREACH` ×2), write blocked by a read-only database transaction ×1, timeout ×1, out-of-credits ×1, Gemini turn-order error ×1 (`function call turn comes immediately after a user turn`).

**Caveats (do not over-read these numbers):**
- **Zero `MALFORMED_FUNCTION_CALL` rows appear.** That does not prove it never happens: a recovered turn is logged as success, and until this change nothing counted recoveries. The new ai_runs.metadata decision joined to final turn status enables counting requested retries after deployment; it does not prove factual answer accuracy.
- Several failures look like **local development runs writing to the production table** (missing key, `ENETUNREACH`, `read-only transaction`). `ai_runs` has no environment column, so these cannot be separated from real user failures. Treat 97% as a floor, not a measurement of real users.
- 2 and 0 runs are too few to rate Host Ops or the Events agent.

## 6. Open problems

| # | Problem | Evidence | Severity |
| --- | --- | --- | --- |
| 1 | Fix committed to open PR but not deployed | PR #576 head and deployment SHA must be compared | Blocks "production ready" |
| 2 | Concierge "New Chat while a reply is still streaming": the user message was not saved within 60 s on one of 5 first attempts | 1 flaky, then 3/3 pass. Screenshot at `test-results/prod-concierge-thread-life-51b14-g-leaves-the-new-chat-clean-prod-smoke/` (treat as sensitive). Cause not found. | Medium (≈20% in 5 first attempts, small sample) |
| 3 | No live proof for wizard **publish**, or for Events discovery | Not run: publish creates a public event; the Events agent has no screen | Medium |
| 4 | Gemini turn-order error seen once in production | `ai_runs`, 2026-10-20 13:04 | Low; not reproduced |
| 5 | The `eventAgent` has no screen and no usage | grep: no component references it | Decision needed |

## 7. What I did not do, and why

- **Wizard Approve / publish on production.** The wizard saves only when the host approves, and that publishes a public event through the `approval-commit` edge function. That goes beyond the throwaway host account you approved, so I stopped at "form filled, nothing written" and proved nothing was written.
- **Vercel runtime-log review and Log Drains.** The new recovery log line does not exist in production until this PR is deployed, so there is nothing to read yet. Drains can be set up once you confirm your plan supports them.
- **Linear update on SAN-1396 · Test and Monitor MDE Host, Events and Concierge AI Reliability.** The Linear connector was not authorized in this session. Paste the scorecard in §2 or authorize the connector.

## 8. Web research (Gemini)

No official Google page explains `MALFORMED_FUNCTION_CALL` or prescribes a fix. Sources are forum threads and GitHub issues, so this is anecdotal:

- [Google AI forum: frequent on Vertex AI, less on the developer API](https://discuss.ai.google.dev/t/malformed-function-call-finish-reason-happens-too-frequently-with-vertex-ai/93630)
- [Forum: large text inside function arguments triggers it](https://discuss.ai.google.dev/t/getting-finishreason-malformed-function-call-when-function-calling-arugments-contain-large-amount-of-text-content/69488)
- [Forum: reproducible on the follow-up step after a tool result with large context](https://discuss.ai.google.dev/t/malformed-function-call-on-function-response-continuation-with-large-context-gemini-3-1-pro-preview-reproducible/174446)
- [pydantic-ai PR: treat it as retryable](https://github.com/pydantic/pydantic-ai/pull/3095)

Disposition: **MODEL**. The community consensus (detect the finish reason, retry a small bounded number of times, never silently return empty) matches the repo's existing processor. Not adopted: forced tool mode and temperature-0 retries, because no production evidence yet shows one retry is insufficient.

## 9. Production-readiness grade

This is my judgment, not a measurement. Weights are mine; adjust them if you disagree.

| Criterion | Weight | Score | Why |
| --- | --- | --- | --- |
| Recovery coverage in code (4 of 4 agents) | 20 | 20 | Wired and tested |
| Failure-injection proof | 20 | 15 | 8 failure kinds on one shared setup, not the 10 per agent proposed |
| Live browser journeys | 25 | 19 | Host Ops (incl. sales accuracy), Wizard form-fill, isolation and Concierge threads proven at 390 and 1440 px; wizard publish and Events not |
| Monitoring with real denominators | 15 | 9 | Existing mixed-environment counts; retry metadata available on new head, production-only outcomes pending deploy |
| Deployed and verified in production | 20 | 9 | Baseline verified on current prod; fix itself not deployed |
| **Total** | **100** | **72** | |

**Production ready?** No. Criteria to reach it: fix merged and deployed with `/api/version` matching, wizard publish proven once (preview or approved test event), flaky Concierge test 10/10, zero leftover QA rows.

## 10. Next step

Merge the PR, then re-run the three live specs against the deployed SHA and query `ai_runs.metadata.gemini_malformed_retry` for retry decisions and final turn outcomes; use Vercel logs only for diagnostic correlation.
