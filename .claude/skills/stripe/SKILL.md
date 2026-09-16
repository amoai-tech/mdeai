---
name: stripe
description: >-
  Use when MDE work touches Stripe checkout, payment intents, ticket payments, Connect, webhooks, refunds, idempotency, or payment security.
---

# Stripe

Own Stripe-specific implementation and payment safety. Do not own general ticket-domain rules or Supabase policy design.

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
