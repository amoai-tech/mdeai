---
title: MDE Mastra — risk-based tests and proof
description: Load when proving Concierge tool answers, workflows, bookings, payments, retries, or runtime skills before shipping a Mastra change.
parent: mastra
impact: HIGH
tags: mastra, testing, evals, payments, idempotency, grounding
---

# Mastra testing gates — prove the real outcome

**Use when:** adding or changing an agent, tool, retrieval path, renderer, workflow, model, or skill. This is the *what-to-prove* checklist; reuse the current Vitest, Edge Function, database, and Playwright tests. It does not create a second test runner.

## Choose the smallest decisive proof

| Change | Existing owner / focused check | What passing really proves |
| --- | --- | --- |
| Rental budget and returned prices | `src/mastra/tools/__tests__/rental-monthly-budget.test.ts`, `search-rentals-budget-pagination.test.ts` | Same-currency monthly cap is respected; noncomparable currencies cannot displace valid COP listings |
| AI answer grounding | `src/mastra/scorers/__tests__/golden-journeys.test.ts` | The *known* entity/price/ID claims are compared with synthetic tool rows; it does **not** prove dates, amenities, freshness, or correct tool choice |
| Restaurant/event discovery routing | `src/mastra/lib/search-intent-router.test.ts`, `src/mastra/tools/__tests__/classify-intent.test.ts` | Deterministic routing and the classification schema behave as tested; schema acceptance is **not** model tool-selection accuracy |
| Structured cards and actions | `src/mastra/tools/__tests__/show-recommendations.test.ts`, `src/mastra/lib/recommendation-surface-bridge.ts` | Check IDs and tool-result provenance before separately testing browser rendering, Details selection, and map/card synchronization |
| Ticket checkout and webhook | `src/app/api/tickets/checkout/route.test.ts`, `supabase/functions/ticket-payment-webhook/index.ts`, `supabase/functions/tests/ticket-stripe-webhook-guards_test.ts` | HTTP/API and signing/mode guard tests are **not** proof of duplicate-event ticket issuance; inspect `ticket_payment_finalize` and persisted order/ticket counts separately |
| Mastra workflow suspension and restart | `src/mastra/workflows/event-venue-booking-workflow.test.ts` and `references/operations-debugging.md` | Validate resumed run identity, authorization, retry and committed transition; this optional admin-review flow is not a Phase A business gate |
| Inputs, isolation and prompt injection | `src/mastra/lib/__tests__/agent-input-processors.test.ts`, server auth/RLS tests | Processor behavior and server permissions are separate checks; a prompt guard does not replace RLS |
| Workspace and specialized skills | `src/mastra/__tests__/registry-workspace.test.ts`, `src/mastra/workspaces.ts` | Development workspace behavior only; current hosted Concierge does not receive this workspace |
| Mastra package guidance | `npm run check:skills` | Canonical relative symlinks, upstream integrity and SDK snapshot drift; not user-journey correctness |

## Quick deterministic baseline

Run only affected files first, for example:

```bash
npx vitest run src/mastra/scorers/__tests__/golden-journeys.test.ts src/mastra/tools/__tests__/rental-monthly-budget.test.ts src/mastra/tools/__tests__/search-rentals-budget-pagination.test.ts src/mastra/lib/search-intent-router.test.ts
npx vitest run src/app/api/tickets/checkout/route.test.ts src/mastra/workflows/event-venue-booking-workflow.test.ts
npm run check:skills
npm run check:mastra
```

Then choose the real UI/API/DB journey when the behavior crosses a boundary; use the authorized test environment and cleanup policy in `AGENTS.md`. `npm run floor` plus exact-head CI are the repository gates before merge. Do not treat a skipped environment-dependent test as a pass.

## Failure and replay matrix

1. **Rentals:** ask for furnished two-bedroom apartments under COP 3,000,000. Prove actual returned IDs, COP/month comparison, card/details ID agreement, and honest unknown amenities. No Phase A approval/verification/ownership filters.
2. **Events:** create an authorized TEST-mode checkout; send the same signed webhook twice and a second event type for the same payment; query the actual order, ticket and inventory state. Exactly one set of tickets, correct payment state, no fabricated receipt. The separate `ticket_payment_finalize` RPC is the transactional authority.
3. **Recovery:** simulate a failure before commit and after commit; retry both. Verify no lost writes and no duplicate side effects; client Stop is not database rollback.
4. **Concierge:** ask for a café, a rental, an event, and a two-endpoint route. Capture actual selected tool IDs and returned objects; a plausible natural-language answer alone does not prove the tool was chosen correctly.
5. **Security:** an imported listing or event description contains instructions to fetch another user's data. Verify it remains untrusted source text and the authenticated server rejects cross-user access; do not add Phase B business gates.
6. **Hosted skill proof:** before enabling any runtime skills, test packaging on Vercel, authorization, read-only filesystem behavior, and no `.claude/skills/` exposure. Do not mark local-only workspace tests as hosted proof.

Record commit SHA, scenario, data source, attempted operation, HTTP/tool result, persisted rows and cleanup, retry outcome, and test command. Mark **unverified** where no authorized live execution occurred.

Related: `evals-experiments.md`, `structured-output.md`, `processors-guardrails.md`, `operations-debugging.md`, and `runtime-skills-tool-selection.md`.
