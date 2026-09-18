---
name: stripe-review
description: Review MDE Stripe checkout, webhooks, ticket/payment writes, refunds and Connect changes for signature, idempotency, replay, authority and secret-boundary defects.
metadata:
  owner: SAN-1312
  version: "1.0.0-mde.1"
---

# Stripe PR Review

Apply only when changed code touches payments, checkout, webhooks, refunds, Connect or payment-derived fulfillment.

## Source of truth

1. Changed MDE payment code/tests and installed Stripe SDK behavior.
2. Canonical MDE .claude/skills/stripe/SKILL.md.
3. Current official Stripe documentation.

## Review invariants

- Verify webhook signatures from the raw request body before trusting events.
- Make webhook and fulfillment side effects idempotent; duplicate delivery must not duplicate tickets, ledger rows, inventory changes or payouts.
- Never trust client-controlled payment status, amount, product, price or ownership as final authority.
- Reconcile payment state server-side against trusted Stripe/event data.
- Keep secret keys and webhook secrets server-only.
- Keep test/live resources and credentials separated.
- Retry/lost-response/replay paths must converge on one business effect.

For replay/idempotency defects include:
- Fix: the smallest durable idempotency/authority correction.
- Verification: duplicate the same event/request and prove only one protected business effect exists.
- Expected result: retries/replays are safe and payment-derived state remains server-authoritative.
