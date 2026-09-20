---
title: Restaurants
description: Current restaurant discovery, search fast path, booking sheet, data sources, and tests.
status: current
updated: 2026-09-20
source_of_truth: current repository code and tests
---

# Restaurants

Canonical documentation for restaurant discovery and the supported booking/contact journey.


## Contents

- [User journey](#user-journey)
- [Current routes and APIs](#current-routes-and-apis)
- [Key code](#key-code)
- [Data and source of truth](#data-and-source-of-truth)
- [Verification](#verification)
- [Related docs](#related-docs)

## User journey

1. User opens `/restaurants` or asks chat for a restaurant.
2. Browse/search applies current filters and fast-path logic.
3. Result cards/detail surfaces present restaurant data.
4. Supported booking interaction continues through the restaurant booking sheet; provider/database behavior remains authoritative.

## Current routes and APIs

- `/restaurants` → `src/app/restaurants/page.tsx`
- Search API → `src/app/api/restaurants/search/route.ts`

## Key code

- `src/components/restaurants/`
- `src/components/copilot/restaurant-card.tsx`
- `src/components/sheets/restaurant-booking-sheet.tsx`
- `src/lib/restaurant-search-fast-path.ts`
- `src/mastra/tools/search-restaurants.ts`

## Data and source of truth

Current Supabase schema, seeds, grounded/provider data, and search code own implementation truth. Relevant database history includes `20260404044721_restaurants_seed.sql` and `20260601120100_data039_restaurants_schema_patch.sql`.

## Verification

Representative tests:

- `src/app/api/restaurants/search/route.test.ts`
- `src/lib/__tests__/restaurant-search-fast-path.test.ts`
- `e2e/screens/SCREEN-023-restaurant-listings.spec.ts`
- `e2e/screens/SAN-577-restaurants-map.spec.ts`
- `e2e/restaurant-card-fast-path.spec.ts`

## Related docs

- `docs/05-design/screens/product-wireframes/restaurants/001-restaurant-search.md`
