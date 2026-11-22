# MDE Mastra observability, workflow recovery and WhatsApp reliability

**Use when:** a Concierge or WhatsApp answer is missing, stale, duplicated, slow, blocked, or reported as successful without a persisted result. This guide routes to existing implementation; it does not create an observability platform.

## Trace one real turn

1. Confirm the target deployment and commit. Inspect MDE's existing Vercel/Next.js route logs for the relevant request.
2. Follow the shared run through src/app/api/copilotkit/[[...path]]/route.ts, src/mastra/copilotkit/logging-mastra-agent.ts, tool execution, and src/mastra/lib/log-agent-run.ts.
3. Read the existing ai_runs telemetry shape in src/mastra/lib/mastra-telemetry.ts: agent key, model, failure class, turn duration, tokens, estimated cost and deployment SHA. Never expose sensitive messages or secret values in diagnostics.
4. Determine which boundary failed: user/tenant context, discovery/retrieval, model, tool, UI rendering, database commit, outbound channel. A successful model turn is not proof that booking or ticket creation succeeded.
5. For optional CLI inspection, verify local CLI help and **always select the explicit authorized target** with --url. Some Mastra observability commands default to hosted endpoints. Do not upload traces or change hosting automatically.
6. Report exact observed request/turn outcome and readback, rather than a model explanation. Prefer fixing the existing boundary.

## WhatsApp reliability

- Existing owners: src/mastra/agents/whatsapp-channels.ts, src/app/api/whatsapp/webhook/route.ts, src/app/api/whatsapp/process-inbound/route.ts.
- Confirm credentials are server-side; no credentials must be logged or exposed to clients.
- Separate “webhook accepted” from “agent found results” from “outbound message sent”.
- Confirm retry/dedup behavior across worker invocations; a duplicate inbound event cannot create a second lead or outbound action.
- Keep per-sender/thread identity mapped to the authenticated/authorized data boundary; never reuse another renter's memory.
- Reuse MDE's existing whole-run outbound buffering. Do not add a second channel dispatcher or adapter and do not assume a serverless in-process timer is durable.

## Workflow resume/recovery

- Existing event venue workflow: src/mastra/workflows/event-venue-booking-workflow.ts and src/lib/events/start-admin-review-workflow.ts.
- The registered workflow implements an **admin-review route for venue proposals**. It is not authority to block the ordinary Events publishing/booking/checkout journey during Phase A. When a UI is unexpectedly blocked, trace its actual call path before editing.
- Reconstruct a suspended run by the **persisted** runId; do not start a new run for a resume.
- Test initial suspend; accepted and rejected resumption; double submit; resume after restart; stale/missing runId; unauthorized actor; one persisted transition only. Distinguish a transition already committed before user Stop from an uncommitted request.
- Preserve atomic backend transitions and audit records. Approval management can be tested separately without becoming a booking or publication prerequisite.

## Ticket payment recovery — separate from agent workflows

The real ticket flow belongs to `src/app/api/tickets/checkout/route.ts`, `supabase/functions/ticket-payment-webhook/index.ts`, and the existing `ticket_payment_finalize` / `ticket_checkout_cancel` database RPCs. Do **not** move webhook processing into a Mastra run or add a second booking engine.

1. Verify the Stripe webhook **signature** and test/live-mode boundary; the existing `supabase/functions/tests/ticket-stripe-webhook-guards_test.ts` proves these guard primitives, not end-to-end idempotency.
2. Follow `checkout.session.completed` and `payment_intent.succeeded`: they may refer to the **same** payment with **different event IDs**. The existing event-ID check in `idempotency_keys` alone cannot prove cross-event exactly-once behavior; check the canonical `ticket_payment_finalize` RPC's transactional behavior and durable order/ticket uniqueness.
3. Replay an identical event ID; then deliver distinct relevant event types for the same checkout; then try concurrent delivery and a failure before/after commit in a safe, authorized TEST-mode environment. Assert paid order, issued ticket IDs, inventory and total amount from persisted data — never from the agent's wording.
4. If a response timed out after commit, retry safely and read back the original order instead of creating a new one. If the payment was never committed, record the actual error and avoid a success claim. A client Stop cannot undo an already committed payment.
5. Confirm duplicates cause no second tickets or stock decrement, and failure/replay leaves no orphaned records. Use existing checkout tests and database proof, with cleanup recorded. Do not claim the signature-guard unit tests alone verify concurrency or Stripe delivery.

## Real failure example

A renter asks on WhatsApp for apartments under COP 3M and gets no useful answer. First verify the search tool returned rows; then inspect the agent turn and message formatter; finally confirm outbound sending. If retrieval produced zero because a specific vector path missed real structured inventory, fix the canonical retrieval/fallback owner rather than building a separate WhatsApp search engine.

## Sources

- Community patterns: https://github.com/YGhorbel/awesome-mastra-skills/tree/master/skills/mastra-observability
- Channels: https://github.com/YGhorbel/awesome-mastra-skills/tree/master/skills/mastra-channels
- Resume: https://github.com/YGhorbel/awesome-mastra-skills/tree/master/skills/mastra-workflow-suspend-resume
- Official: https://mastra.ai/docs/observability/overview
