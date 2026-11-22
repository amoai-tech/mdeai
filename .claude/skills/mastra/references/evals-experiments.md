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
2. **Make a fixed synthetic baseline.** Pair tool outputs and replies with expected pass/fail outcomes in the existing scorer fixture. Use no invented claims as if they were actual inventory.
3. **Run the deterministic scorer test before editing.** Change one input dimension (prompt, model configuration, tool or retrieval) at a time.
4. **Run it again and compare every case, not only average score.** New false positives and negatives need a concrete regression fixture.
5. **For genuinely subjective output**, first inspect the installed @mastra/core, @mastra/evals and @mastra/pg package types and documentation. Only then consider Mastra datasets, experiments, runEvals and LLM-judge scoring; these are not preinstalled requirements here.
6. **Keep side effects isolated** in experiments: deny unmocked booking, payment, ticket, viewing and lead writes. Real workflow proof belongs in the existing authorized integration/DB tests, not a model evaluation.
7. **Do not claim full answer correctness from the two current scorers.** They cover extracted named entities, money and IDs, not all amenities, dates, location relevance, map coordinates, inventory freshness or eventual DB effects.

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
