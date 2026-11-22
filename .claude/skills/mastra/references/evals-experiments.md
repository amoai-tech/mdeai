# MDE Mastra evaluations and comparison experiments

**Use when:** changing a Concierge prompt, tool, model, RAG retrieval, recommendation, or answer formatting. MDE already has two registered deterministic scorers; reuse them before adding another judge or evaluation service.

## Existing owners

- Agent and scorer registration: src/mastra/index.ts and src/mastra/scorers/index.ts.
- Faithfulness (entity, price, ID claims): src/mastra/scorers/faithfulness-core.ts.
- Named-entity coverage: src/mastra/scorers/grounding-coverage-core.ts.
- Existing scorer tests: src/mastra/scorers/__tests__/.
- Synthetic golden examples: src/mastra/scorers/__tests__/fixtures/grounded-concierge-journeys.json and their Vitest runner.
- Existing optional provider smoke: scripts/intelligence/faithfulness-smoke.ts.

Do not create a new search engine, scorer registry, telemetry pipeline, or detached Mastra project. GitHub CI and the existing Vitest scripts are the first evaluation runner.

## Fast baseline → change → compare workflow

1. **Define observable facts.** For Rentals, check actual tool-row ID, listing name, price, budget and whether an amenity was specified; for Events, check returned title, date, venue and ticket availability only when supplied. For Restaurants, check source names and hours only when grounded.
2. **Keep the scorer regression fixture fixed.** Run `npx vitest run src/mastra/scorers/__tests__/golden-journeys.test.ts` before and after edits. Its synthetic `toolOutputs` and `reply` values prove the *scorers*, **not** the Concierge's prompt, model, or live answer quality. Never treat unchanged fixture scores as an agent improvement.
3. **Capture real baseline agent replies before changing the agent.** In an authorized test harness using the **registered Concierge** and its existing prompt/model configuration, send a small fixed set of user prompts and conversation contexts. Stub read-only discovery tools with **identical synthetic tool rows** for repeatability; deny every unmocked or side-effecting tool (booking, payment, ticket, viewing, lead, outbound messaging). Use separate test thread/resource identities, no production credentials, and no real writes. Record per case: case ID, prompt/context, executed tool names and outputs, actual final agent reply, model/provider, and baseline commit. A static JSON `reply` is **not** an agent capture.
4. **Capture candidate replies after exactly one change.** Run the *same prompts, context, isolated tool responses, and safety rules* using the changed Concierge prompt/model/tool configuration. Record actual replies with the candidate commit; reject missing cases, unmocked calls or mismatched tool-output fixtures. If the selected tool differs, report the tool-choice regression separately rather than comparing mismatched evidence.
5. **Score both captured reply sets.** For each paired case, pass the recorded `toolOutputs` and **actual** baseline/candidate replies to the existing `evaluateFaithfulness` and `evaluateGroundingCoverage` functions from `src/mastra/scorers/`. Compare scores, unsupported claims, actual tool calls, and case-level regressions—not just averages. A 1.0 score with zero checkable claims is inconclusive; validate budget, amenities, dates, and action results separately.
6. **Turn observed regressions into fixtures.** Keep the original synthetic scorer regression test unchanged; add a focused case or agent integration test when a new prompt/model behavior fails. Captured production/personal conversation data must not be committed or sent to external review tools.
7. **For genuinely subjective output**, verify installed @mastra/core, @mastra/evals and @mastra/pg APIs before considering datasets, experiments, runEvals or an LLM judge. Do not install a second evaluation service just for this comparison.
8. **Do not claim complete answer correctness from the existing scorers.** They cover extracted named entities, money and IDs, not all amenities, dates, location relevance, coordinates, inventory freshness or eventual database effects. Real booking/payment proof remains in existing authorized API/DB tests.

### Real examples

- Rental: source returns “Casa Jardín Azul” at 2,400,000 COP. Answer says 3,100,000 COP → faithfulness fails even though entity coverage can pass.
- Restaurant: tool returns one venue but answer names another → both scorers flag unsupported named entities.
- Event: a title returned by the event tool may be mentioned, but a fabricated ticket time must be caught by a **separate date/time assertion**; the current scorers do not guarantee it.
- Booking: never use “agent says booked” as a successful grade. Verify authenticated API write, one persisted record, retry idempotency and UI readback.

## Budget and tool-choice assertions beyond the scorers

- For a COP 3M/month rental request, use `src/mastra/tools/__tests__/rental-monthly-budget.test.ts` and `search-rentals-budget-pagination.test.ts` to verify the **actual** same-currency PostgREST predicate and result page; then check Concierge-selected tool calls and displayed cards in an authorized integration/browser run. A faithful answer can still be **over budget** if it faithfully repeats a bad tool result.
- `src/mastra/lib/search-intent-router.test.ts` verifies the deterministic events/Maps decision; `src/mastra/tools/__tests__/classify-intent.test.ts` verifies intent-tool schemas. Neither proves the LLM chose the correct tool. Capture expected vs actual tool call and unchanged retrieved record IDs for that.
- For ticketing, use the actual `src/app/api/tickets/checkout/route.test.ts`, `supabase/functions/ticket-payment-webhook/index.ts`, and the transactional `ticket_payment_finalize` RPC. Scorer text or a synthetic mock cannot certify a paid order, exactly one ticket set or retry correctness.
- Choose `testing-gates.md` for risk-matched commands and a full pass/fail evidence matrix. Do not register a new model judge just to catch a deterministic budget or tool-selection failure.

## What to report

Case name; input/tool facts; expected versus actual; scorer result; any uncovered fields; exact code SHA; test command and pass/fail. A zero-claim score of 1.0 means “no claims found”, **not** that the answer is verified.

## Source and compatibility

- Community pattern: https://github.com/YGhorbel/awesome-mastra-skills/tree/master/skills/mastra-datasets-experiments
- Official guide: https://mastra.ai/docs/evals/overview
- Official experiments: https://mastra.ai/docs/evals/experiments
- Always confirm the installed Mastra version; do not add @latest or external services just for examples.
