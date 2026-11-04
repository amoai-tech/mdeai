# Official Stripe tools first

Use this guide when planning, fixing, or validating Stripe work in MDE. Stripe's **official** guidance is authoritative for product and tool capabilities; installed SDK versions and MDE's current code are authoritative for compatibility. Recheck both before implementing.

## 1. Inspect existing integration and available tools

- Trace MDE's current Next.js ticket API routes, Supabase `ticket-checkout` and `ticket-payment-webhook` Edge Functions, and the database transaction/RPC path. Inspect the actual import and `apiVersion` in both functions; skill metadata is a historical snapshot, not a version pin to copy into new code.
- Prefer any **already connected** official Stripe plugin/MCP tool for reading TEST account resources and searching Stripe documentation.
- If an agent tool is not connected, use official docs without inventing a custom Stripe API proxy or installing software automatically.

## 2. Official developer and agent tooling

| Need | Official tool / source | Action |
| --- | --- | --- |
| Current integration guidance | [Stripe Agents and AI](https://docs.stripe.com/agents) and [Stripe skills](https://docs.stripe.com/skills) | Read the applicable up-to-date skill/documentation before coding. |
| Agent setup | [Stripe agent setup](https://docs.stripe.com/cli/agent/setup) | If the owner wants tooling installed, check CLI availability, then use `npm install -g @stripe/cli` and `stripe agent setup` as documented. Do not run installs or authorize a Stripe account without the owner's action. |
| Stripe docs from terminal | [Stripe CLI docs](https://docs.stripe.com/cli/docs) | If the Stripe CLI is available, use `stripe docs` for current vendor documentation. |
| Agent/API and docs access | [Hosted Stripe MCP](https://docs.stripe.com/mcp) | Prefer the official `https://mcp.stripe.com` endpoint via a connected client, with OAuth or a least-privilege agent API key held outside Git. |
| Account configuration and TEST events | [Stripe Dashboard/Workbench](https://dashboard.stripe.com/) and [Stripe CLI](https://docs.stripe.com/cli) | Use provider-native TEST controls; inspect events, signatures, and delivery/replay evidence. Never assume a simulated event proves provider delivery. |
| SDK/version compatibility | [Stripe API versioning](https://docs.stripe.com/upgrades) | Compare documented behavior against the installed SDK, pinned API version, and actual payloads; upgrade only with targeted regression tests. |

**Do not install or use retired agent packages as a default.** Stripe's [official `stripe/ai` repository](https://github.com/stripe/ai) now directs agents to its hosted MCP instead of deprecated `@stripe/agent-toolkit` and `@stripe/mcp` packages. Avoid maintaining a second local Stripe server.

## 3. Provider-first implementation decisions

1. **Ticket/rental payment:** prefer [Stripe-hosted Checkout](https://docs.stripe.com/payments/checkout) and existing MDE checkout routes. MDE owns business records and authorization, not card processing.
2. **Payment confirmation:** use [signed webhooks and server-side fulfillment](https://docs.stripe.com/checkout/fulfillment), including async successful payment methods. Never finalize a booking or ticket from the browser return URL.
3. **Lost response / duplicate calls:** use Stripe [idempotency keys](https://docs.stripe.com/api/idempotent_requests) *and* existing MDE database atomicity and uniqueness. Retrying must converge on one order, one ticket entitlement, and one protected business effect.
4. **Refunds:** use Stripe's [refunds API](https://docs.stripe.com/refunds), preserving MDE's signed webhook reconciliation and protection against replay/double inventory adjustments.
5. **Partner payouts:** prefer official [Stripe Connect](https://docs.stripe.com/connect) for supported account onboarding, transfers, and payouts. Verify country/currency capabilities before designing a custom solution.
6. **Accounting:** check official Stripe reporting or supported data integrations first. Do not replace or duplicate the operational webhook with an analytics sync.

## 4. Safety and proof

- Default to MDE's **existing Stripe TEST account** and its real application code. Never use live charges or real payout actions for development tests.
- Never display, commit, paste into logs, or pass on a command line any real API key or webhook secret. Keep authentication server-side; prefer OAuth or least-privilege managed keys.
- Separate **provider-side truth**, **MDE database state**, **browser experience**, and **test simulation**. A green test cannot substitute for a genuine TEST Checkout, provider webhook, retry, or refund where those are acceptance criteria.
- Preserve all technical controls: signed raw-body webhook verification, authorization, isolation, transaction integrity, idempotency, and audit evidence. Do not introduce Phase A business approval or ownership gates.
- Before proposing code, document: **existing owner -> official Stripe feature/tool -> smallest integration change -> tests/proof**. If existing code and official tooling already satisfy the need, recommend **no new code**.
