---
title: Trips
description: Current trip dashboard, itinerary workspace, persistence sources, and tests.
status: current
updated: 2026-09-20
source_of_truth: current repository code and tests
---

# Trips

Canonical documentation for saved trips and itinerary workspace behavior.


## Contents

- [User journey](#user-journey)
- [Current routes](#current-routes)
- [Key code](#key-code)
- [Data and source of truth](#data-and-source-of-truth)
- [Verification](#verification)
- [Related docs](#related-docs)

## User journey

1. User opens `/trips` to see available/saved trips.
2. User opens `/trips/[id]` to work with one itinerary.
3. The workspace loads persisted trip state and trip items.
4. Itinerary operations update the supported persisted model; refresh should reproduce the durable state.

## Current routes

- `src/app/trips/page.tsx`
- `src/app/trips/[id]/page.tsx`

## Key code

- `src/components/trips/`
- `src/lib/trips/load-user-trips.ts`
- `src/lib/trips/load-trip-workspace.ts`
- `src/lib/trips/itinerary-logic.ts`
- `src/lib/trips/trip-item-types.ts`

## Data and source of truth

Current Supabase trip tables/RPCs and migrations own persistence truth. Relevant history includes `20260524024419_restore_post_mvp_trip_planner.sql`, `20260529235115_data027_trip_items_check_and_rpc.sql`, and commerce-trip linkage where applicable.

## Verification

Representative tests:

- `src/lib/trips/__tests__/itinerary-logic.test.ts`
- `src/lib/trips/__tests__/format-trip-dates.test.ts`
- `e2e/screens/SCREEN-012-trips.spec.ts`

## Related docs

Current product/architecture docs apply; live roadmap/task state remains in Linear rather than this README.
