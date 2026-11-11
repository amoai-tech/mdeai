---
name: stripe
description: >-
  Use when MDE work touches Stripe checkout, payment intents, ticket payments, Connect, webhooks, refunds, idempotency, or payment security.
metadata:
  verified-package: "stripe@14.21.0 — Deno edge functions via esm.sh; no npm SDK installed"
  verified-api-version: "2026-04-22"
  verified-at: "2026-09-28"
---

# Stripe

Own Stripe-specific implementation and payment safety. Do not own general ticket-domain rules or Supabase policy design.

## Where Stripe actually runs

There is **no Stripe npm dependency** in this repo. Stripe is imported inside the
Deno edge functions:

```ts
import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
```

`supabase/functions/ticket-checkout/` and `supabase/functions/ticket-payment-webhook/`
pin `apiVersion: "2026-04-22"`. Re-verify both the module version and the API version
before changing payment code — an API-version bump can change field shapes a webhook
handler depends on. Next.js route handlers under `src/app/api/tickets/` call into
those functions rather than the Stripe SDK directly.

## Source order

1. Inspect the current MDE payment code and installed dependencies.
2. Verify the exact API behavior in current Stripe official docs before changing payment contracts.
3. Preserve existing MDE architecture unless the task explicitly requires migration.

## MDE invariants

- Never expose secret keys or webhook secrets to client code.
- Verify webhook signatures from the raw request body before trusting an event.
- Make webhook side effects idempotent; duplicate delivery must not duplicate tickets, ledger rows, or fulfillment.
- Never treat a client redirect or client-supplied status as proof of successful payment.
- Keep payment writes scoped to the authenticated organization/user and the intended checkout object.
- Current repo has no direct Stripe npm dependency; do not add one unless the task requires it and the existing edge/HTTP pattern is insufficient.

## Workflow

1. Identify checkout, webhook, refund, Connect, or reconciliation path.
2. Trace the current request and persistence path end to end.
3. Define duplicate/retry/failure behavior before editing.
4. Implement the smallest safe change.
5. Run targeted unit/integration checks plus duplicate-delivery and invalid-signature cases for webhook work.

## Handoff

Use `events` for ticket/event business rules, `supabase` for RLS/schema, `systematic-debugging` for unknown failures, and `task-verifier` for production-critical completion claims.
