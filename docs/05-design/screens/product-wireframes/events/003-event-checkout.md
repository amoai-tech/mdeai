---
title: Event Checkout
description: Current MDE event ticket checkout architecture, user journey, recovery behavior, and implementation references.
status: current
updated: 2026-09-20
source_of_truth: current code and tests
---

# Event Checkout

> Route: `/events/[slug]`
> User: Consumer
> Phase: Core · P0

The current checkout is **not** a standalone `/events/[slug]/checkout` page and MDE does **not** collect card numbers itself. Ticket selection opens an in-app checkout modal, the server creates a checkout session through Supabase, and the browser is redirected to Stripe-hosted payment.

## Contents

- [Page goal](#page-goal)
- [Current user journey](#current-user-journey)
- [Architecture](#architecture)
- [UI contract](#ui-contract)
- [Retry and failure behavior](#retry-and-failure-behavior)
- [Security and payment boundary](#security-and-payment-boundary)
- [Source of truth](#source-of-truth)
- [Verification](#verification)

## Page goal

Let a consumer choose an available event ticket tier and quantity, confirm buyer identity, then continue to Stripe for payment without MDE handling raw payment-card data.

## Current user journey

1. User opens `/events/[slug]`.
2. User chooses a ticket tier and quantity in `EventTicketTiers`.
3. **Buy tickets** opens `BookingCheckoutModal` on the same event page.
4. User enters full name and email and sees the tier, quantity, and total.
5. Submit calls `/api/tickets/checkout` with a stable idempotency key.
6. The API delegates checkout creation to the Supabase `ticket-checkout` Edge Function.
7. Browser redirects to the Stripe-hosted checkout URL returned by the API.
8. After payment, the event page reads the checkout result and the ticket/wallet flow can continue.

## Architecture

```mermaid
flowchart LR
    A[Event detail /events/slug] --> B[Ticket tier + quantity]
    B --> C[BookingCheckoutModal]
    C --> D[/api/tickets/checkout]
    D --> E[Supabase ticket-checkout Edge Function]
    E --> F[Stripe checkout session]
    F --> G[Stripe-hosted payment]
    G --> H[Return to MDE + checkout result]
```

## UI contract

The modal shows only information MDE owns:

- event name;
- selected ticket tier;
- quantity;
- calculated total;
- buyer full name;
- buyer email;
- retry/error state;
- **Pay with Stripe** action.

Do **not** add card-number, expiry, or CVC inputs to MDE unless the payment architecture is deliberately changed and re-reviewed. Current UI explicitly states that payment is not processed in the browser.

## Retry and failure behavior

`BookingCheckoutModal` creates one `crypto.randomUUID()` idempotency key per checkout target and reuses it across retries. Recoverable network/API failures may show **Try again**; the retry must not create an unintended duplicate payment attempt.

The UI classifies checkout errors and hides the retry action for non-retryable failures.

## Security and payment boundary

- Raw payment-card entry belongs to Stripe-hosted checkout.
- MDE sends buyer/ticket/order intent, not card credentials.
- `/api/tickets/checkout` is the server boundary before the Supabase Edge Function.
- Stripe webhook processing remains server-side in `ticket-payment-webhook`.
- Checkout and webhook behavior must preserve idempotency and signature/authentication checks.

## Source of truth

Current implementation:

- `src/app/events/[slug]/page.tsx`
- `src/components/events/event-ticket-tiers.tsx`
- `src/components/modals/booking-checkout-modal.tsx`
- `src/lib/tickets/submit-ticket-checkout.ts`
- `src/app/api/tickets/checkout/route.ts`
- `supabase/functions/ticket-checkout/`
- `supabase/functions/ticket-payment-webhook/`

Current tests include:

- `e2e/screens/SCREEN-009-checkout.spec.ts`
- `e2e/san-715-checkout-states.spec.ts`
- `e2e/prod-journey-j05-j20.spec.ts`

## Verification

Before changing this document, verify the current code path above. If checkout architecture changes, update this document in the same PR and run the relevant checkout/E2E tests plus the repository documentation check.
