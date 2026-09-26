# Stripe review invariants

## Source of truth

1. Changed MDE payment code/tests and installed Stripe SDK behavior.
2. Canonical `stripe/SKILL.md`.
3. Current official Stripe documentation.

## Review invariants

- Verify webhook signatures from the raw request body before trusting events.
- Make webhook and fulfillment side effects idempotent; duplicate delivery must not duplicate tickets, ledger rows, inventory changes, or payouts.
- Never trust client-controlled payment status, amount, product, price, or ownership as final authority.
- Reconcile payment state server-side against trusted Stripe/event data.
- Keep secret keys and webhook secrets server-only.
- Keep test/live resources and credentials separated.
- Retry/lost-response/replay paths must converge on one business effect.

For replay/idempotency defects, require a duplicate event/request test proving only one protected business effect exists.
