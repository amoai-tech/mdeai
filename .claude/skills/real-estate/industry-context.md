---
name: real-estate-expert
description: Use when generic real-estate terminology, workflows, or industry background is needed; jurisdiction-specific MDE claims require separate current sources.
category: domains
tags: [real-estate, property, crm, listings]
---

# Real Estate Industry Context

Reference only. Current MDE contracts live in [rental-mvp.md](rental-mvp.md) and [broker-operations.md](broker-operations.md).

## MDE / Colombia boundary

For MDE work:

- exact Linear requirements, current `main`, live Supabase, and verified Medellín/Colombia sources outrank this file;
- verify law/regulation with current official Colombian or Medellín authorities before relying on it;
- never import US MLS/NAR/FHA/RESPA/CCPA/ADA, lending, school-district, HOA, disclosure, currency, sqft/acre/mile, buyer/seller, or late-fee assumptions into MDE requirements;
- dynamic prices, rates, availability, market statistics, provider rules, and regulatory claims are unverified until sourced;
- generic examples cannot override canonical eligibility, provenance, ownership, requestability, authorization, or viewing contracts.

## Neutral vocabulary

| Concept | MDE meaning |
|---|---|
| Rental/listing | A property record; its provenance and requestability must be explicit |
| Renter | User searching for or requesting a rental |
| Broker/landlord | Authorized operator resolved through the canonical ownership model |
| Lead | Renter interest tied to the correct rental/business context |
| Showing/viewing | Scheduled property-viewing record linked to the lead/rental |
| Published | Workflow state; not automatically launch-ready or requestable |
| Requestable | Backend-validated MDE rental eligible for the canonical Schedule Viewing action |
| External listing | Third-party inventory; remains external and uses its verified source URL |
| Provenance | Evidence describing where a fact/listing came from |
| Freshness | Evidence that time-sensitive listing facts are still current |

## Domain principles

1. **Grounded inventory:** a listing is a set of verified/known facts, not a prompt for the model to complete missing fields.
2. **Deterministic hard rules:** dates, hard budget/bedroom/location constraints, ownership, and authorization are not AI guesses.
3. **One identity:** search, cards, maps, leads, showings, and broker views must refer to the same canonical rental identity.
4. **Least privilege:** UI visibility never substitutes for RPC/RLS authorization.
5. **Jurisdiction awareness:** Colombia/Medellín rules and provider terms must be verified for the actual product behavior.
6. **No steering:** recommendations use user-stated preferences and objective property/location facts, never protected/sensitive traits or proxies.

## When external standards really apply

Load [mls-v2.md](mls-v2.md) only when the owning task explicitly needs MLS, IDX, RETS, RESO, AVM/comparables, a large licensed feed, or proven scale architecture. A `RENTV2` label is not such a trigger.
