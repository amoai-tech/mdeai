---
name: rental-mvp
description: Use when working on current MDE Medellín rental discovery, inventory, eligibility, ranking, cards/maps, viewing requests, production certification, or RENTV2 Linear work.
---

# Current MDE Rentals

This is the canonical implementation guide for current MDE rental work. `RENTV2` is a Linear product label; it does **not** mean MLS/IDX architecture.

## Source of truth

Before implementing:

1. Read the exact Linear issue, relations, status, labels, and acceptance criteria.
2. If the change affects the end-to-end rental journey, read **SAN-1315 · EPIC · Finish the rental journey from apartment discovery to committed viewing**.
3. Inspect current `main`; reuse existing contracts, `RentalSearchEngine`, map state, viewing path, and tests.
4. When schema/RLS/runtime data matters, inspect live Supabase and compare it with migrations on `main`.
5. Read root `mvp.md` for launch scope. Linear is live execution state; GitHub/Supabase are implementation/runtime truth.
6. Make the smallest change that closes the owning task. Do not rebuild behavior owned elsewhere.
7. Prove the real user journey, including negative authorization and retry behavior where relevant.

Never freeze task status, production row counts, model versions, or other volatile facts in this skill.

## Canonical rental journey

```text
renter intent
→ NormalizedRentalCriteria
→ deterministic RentalEligibility
→ eligible inventory only
→ trust / freshness / dedupe
→ soft ranking
→ RentalResult
→ synchronized card + pin
→ Schedule Viewing
→ renter/guest identity resolved according to the canonical viewing contract
→ authorized business capability
→ atomic lead + showing
→ owning broker sees it
→ unrelated broker denied
```

Retry invariant:

```text
same logical viewing request retried
→ exactly 1 lead
→ exactly 1 showing
→ exactly 1 broker-visible business outcome
```

A UI success state is valid only after the backend commit succeeds.

## Shared contracts

Reuse these contracts across search, UI, persistence, and tests:

- `NormalizedRentalCriteria` — canonical dates, budget, bedrooms, explicit location, and other hard renter intent.
- `RentalEligibility` — deterministic `eligible | ineligible | unknown` with machine-readable reasons.
- `RentalResult` — canonical identity, grounded facts, provenance, trust/freshness, score/reasons, coordinates, and allowed actions.

Do not create feature-specific copies unless the canonical contract is proven unable to represent the requirement.

Hard requirements always run before AI/vector/soft ranking. AI may rank eligible survivors; it may never rescue an ineligible rental.

## Search and provenance

Use the existing `RentalSearchEngine`; do not create another search engine.

```text
MDE/Supabase candidates
→ deterministic eligibility
→ eligible MDE results
→ if eligible supply is insufficient, external discovery
→ Gemini Google Search for candidate discovery
→ URL Context for selected pages
→ Firecrawl only for unresolved extraction gaps
→ verify/extract external facts
→ deterministic eligibility for external candidates
→ conservative trust/dedupe
→ merge eligible results
→ soft ranking
→ Maps/Places/Routes only for bounded finalists
```

Unknown external facts remain `unknown`. Never invent or coerce price, currency, bedrooms, dates, availability, location, coordinates, ownership, provenance, rating, or source URL.

| Provenance/action state | Allowed user action |
|---|---|
| Verified requestable MDE rental | **Schedule Viewing** |
| Verified external rental with real source URL | **View Original Listing** |
| Unknown or insufficient provenance | No invented transaction CTA |

A coordinate-less eligible rental may remain a card; it must not receive an invented pin.

## Architecture boundary

Prefer the shortest authoritative path:

```text
Next.js / CopilotKit UI
→ Mastra agent/workflow
→ typed business tool
→ Supabase RPC
→ Postgres constraints + RLS
```

Use an Edge Function only for a real external or security/runtime boundary such as public ingress, provider secrets, webhooks, or cron. Do not insert one between Mastra and an RPC merely because the operation is backend.

Schedule Viewing currently uses the existing `/api/leads/schedule-viewing` → `chat-lead-capture` Edge Function → atomic `p1_schedule_tour_atomic` RPC path because it is a public/guest security boundary; do not bypass or replace it unless the owning task explicitly changes that contract.

Authentication is not authorization. Service-role/admin success does not prove a user is authorized.

## Production truth rules

- Production must never present mock/demo/test inventory as real supply.
- External listings never silently become MDE-owned/requestable inventory.
- `published`, `launch-ready`, and `requestable` are different claims; use the owning task/current code definitions.
- Unknown facts stay unknown.
- Preserve one canonical rental identity from data → result → card/pin → viewing.
- Tests/fixtures must be explicitly marked, production-safe, cleaned up, and verified for zero residue.

## Verification

Use the smallest useful ladder, expanding when the task affects more layers:

1. focused unit/contract tests;
2. typecheck + lint;
3. pgTAP/RLS allow-and-deny proof for database/auth changes;
4. production build/floor as required by the repository;
5. Playwright for the real renter/broker journey and mobile when affected;
6. exact production-candidate proof for launch certification.

For viewing/security flows, prove renter, owning broker, unrelated broker, anon, and explicit admin/service-role expectations. Hidden UI controls are not authorization.
