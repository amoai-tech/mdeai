---
title: Rentals
description: Current rental discovery, detail, renter lead/viewing, host workflow, data ownership, and tests.
status: current
updated: 2026-09-20
source_of_truth: current repository code and tests
---

# Rentals

Canonical documentation for rental discovery and the host/renter real-estate workflow.


## Contents

- [User journey](#user-journey)
- [Current routes and APIs](#current-routes-and-apis)
- [Key code](#key-code)
- [Data and source of truth](#data-and-source-of-truth)
- [Verification](#verification)
- [Related docs](#related-docs)

## User journey

1. Renter browses `/rentals`.
2. Renter opens `/rentals/[id]` for listing details and availability.
3. Supported inquiry/viewing actions create or update the appropriate rental lead workflow rather than processing rental payment in MDE.
4. Hosts manage inventory and workflow under `/host/rentals`.
5. Chat/agent surfaces can reuse the rental fast path and the rental domain agent.

## Current routes and APIs

- `src/app/rentals/`
- `src/app/host/rentals/`
- `src/app/partners/rentals/`
- `src/app/api/rentals/`
- `src/app/api/host/rentals/`

## Key code

- `src/components/rentals/`
- `src/components/host/rentals/`
- `src/components/chat/rental-*`
- `src/mastra/agents/rental-agent.ts`

## Data and source of truth

Supabase migrations and current RLS/RPC definitions own data truth. Relevant migrations include rental applications, restored rental tables, rental signals, host publishing state, broker RLS, partner-lead alignment, and the 2026-09 ACL hardening migration. Do not duplicate current task status here; use the MDE Real Estate Linear epic.

## Verification

Representative tests:

- `e2e/screens/REAL-011-rentals-browse.spec.ts`
- `e2e/screens/SAN-577B-rentals-map.spec.ts`
- `e2e/san-1202-rental-detail.spec.ts`
- `src/components/host/rentals/__tests__/rentals-concierge-contract.test.ts`

## Related docs

- `docs/05-design/screens/product-wireframes/rentals/`
- `docs/05-design/screens/product-wireframes/rental-hosts/`
