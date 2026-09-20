---
title: Events
description: Current event discovery, hosting, checkout, booking administration, data ownership, and tests.
status: current
updated: 2026-09-20
source_of_truth: current repository code and tests
---

# Events

Canonical documentation for current event discovery, hosting, ticketing, checkout, and booking administration.


## Contents

- [User journey](#user-journey)
- [Current routes and APIs](#current-routes-and-apis)
- [Key code](#key-code)
- [Data and source of truth](#data-and-source-of-truth)
- [Verification](#verification)
- [Related docs](#related-docs)

## User journey

1. Consumer discovers events at `/events`.
2. Consumer opens `/events/[slug]`.
3. Ticket tier selection opens the checkout modal on the event page.
4. `/api/tickets/checkout` delegates to the Supabase `ticket-checkout` function and redirects to Stripe-hosted payment.
5. Hosts manage events through `/host/events` and related host surfaces.
6. Operators review booking state through `/admin/event-bookings`.

## Current routes and APIs

- `src/app/events/`
- `src/app/host/events/`
- `src/app/admin/event-bookings/`
- `src/app/api/events/`
- `src/app/api/admin/event-bookings/`
- `src/app/api/tickets/checkout/route.ts`

## Key code

- `src/components/events/`
- `src/components/host/host-event-*`
- `src/components/modals/booking-checkout-modal.tsx`
- `src/components/admin/event-bookings-*`
- `supabase/functions/ticket-checkout/`
- `supabase/functions/ticket-payment-webhook/`

## Data and source of truth

Current migrations, Edge Functions, and database policies own implementation truth. Important event migrations include `20260503011925_event_phase1.sql`, `20260517045810_evt001_events_rls_alignment.sql`, and later event/venue/booking migrations. Linear owns live execution status.

## Verification

Representative tests:

- `e2e/screens/SCREEN-027-events-browse.spec.ts`
- `e2e/screens/SCREEN-014-event-detail.spec.ts`
- `e2e/screens/SCREEN-009-checkout.spec.ts`
- `e2e/san-715-checkout-states.spec.ts`
- `e2e/screens/SCREEN-016c-host-events-authed.spec.ts`

## Related docs

- `docs/05-design/screens/product-wireframes/events/`
- `docs/05-design/screens/product-wireframes/hosts/`
