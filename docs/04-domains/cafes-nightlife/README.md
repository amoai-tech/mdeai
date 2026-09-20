---
title: Cafes and Nightlife
description: Current cafe and nightlife discovery surfaces, source locations, data inputs, and tests.
status: current
updated: 2026-09-20
source_of_truth: current repository code and tests
---

# Cafes and Nightlife

Canonical documentation for the consumer cafe and nightlife discovery domains.


## Contents

- [User journey](#user-journey)
- [Current routes](#current-routes)
- [Key code](#key-code)
- [Data and source of truth](#data-and-source-of-truth)
- [Verification](#verification)
- [Related docs](#related-docs)

## User journey

1. User opens `/cafes` or `/nightlife`.
2. Browse view loads current venue data and filters.
3. User opens a detail panel/sheet and can continue into the supported booking/contact flow.
4. Chat can surface cafe/nightlife results through the corresponding fast-path/detail components.

## Current routes

- `/cafes` → `src/app/cafes/page.tsx`
- `/nightlife` → `src/app/nightlife/page.tsx`

## Key code

- `src/components/cafes/`
- `src/components/nightlife/`
- `src/components/cafe/`
- `src/components/chat/cafe-detail-mobile-sheet.tsx`
- `src/components/chat/nightlife-detail-mobile-sheet.tsx`
- `src/lib/cafe-browse.ts`
- `src/lib/nightlife-browse.ts`

## Data and source of truth

Curated venue seeds and current database state are implementation truth. Relevant seeds include `supabase/seeds/venues/cafes-medellin.curated.json` and `supabase/seeds/venues/nightclubs-medellin.curated.json`. Do not copy live backlog status into this README; Linear owns current work status.

## Verification

Representative tests:

- `src/lib/cafe-browse.test.ts`
- `src/lib/nightlife-browse.test.ts`
- `e2e/screens/SCREEN-028-cafes-browse.spec.ts`
- `e2e/screens/SCREEN-022-nightlife-browse.spec.ts`
- `e2e/san-575-cafes-visual-evidence.spec.ts`
- `e2e/san-575-nightlife-visual-evidence.spec.ts`

## Related docs

- `docs/05-design/screens/product-wireframes/cafes/001-cafe-search.md`
- `docs/05-design/screens/product-wireframes/nightlife/001-nightclub-discovery.md`
