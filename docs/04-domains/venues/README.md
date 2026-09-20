---
title: Venues
description: Current venue discovery, booking request workflow, data ownership, and tests.
status: current
updated: 2026-09-20
source_of_truth: current repository code and tests
---

# Venues

Canonical documentation for venue discovery and venue booking requests.


## Contents

- [User journey](#user-journey)
- [Current routes and APIs](#current-routes-and-apis)
- [Key code](#key-code)
- [Data and source of truth](#data-and-source-of-truth)
- [Verification](#verification)
- [Related docs](#related-docs)

## User journey

1. User discovers venues at `/venues` or through event/chat discovery.
2. User opens a venue detail surface.
3. A booking/request action collects the supported request fields.
4. The backend creates or transitions the venue booking request using current API/database rules.
5. UI status reflects the durable request state.

## Current routes and APIs

- `/venues` → `src/app/venues/page.tsx`
- `src/app/api/venue-booking/`
- `src/app/api/partners/venue-leads/`

## Key code

- `src/components/browse/venue-*`
- `src/components/sheets/venue-booking-form.tsx`
- `src/components/venues/venue-booking-status-chip.tsx`
- `src/mastra/tools/request-venue-booking.ts`
- `src/mastra/tools/search-venue-anchors.ts`

## Data and source of truth

Current Supabase booking tables/RPCs/RLS and venue-signal migrations own durable state. Relevant migrations include `20260529234934_data009_venue_booking_requests.sql`, `20260611160000_veb_mvp_004_bookings_idempotency.sql`, and `20260601120300_data041_venue_signals.sql`.

## Verification

Representative tests:

- `src/mastra/tools/__tests__/request-venue-booking.test.ts`
- `src/hooks/use-venue-booking-status.test.ts`
- `e2e/screens/SCREEN-007-venue-sheet.spec.ts`
- `e2e/screens/VEN-035-venue-release.spec.ts`
- `e2e/san-494-event-venue-cta.spec.ts`

## Related docs

- `docs/05-design/screens/product-wireframes/venues/`
- `docs/05-design/screens/product-wireframes/venue-owners/`
