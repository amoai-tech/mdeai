---
name: broker-operations
description: Use when current MDE rental work involves broker identity, ownership, onboarding, publishing, leads, showings, broker AI, or cross-broker authorization.
---

# MDE Rental Broker Operations

Use this with [rental-mvp.md](rental-mvp.md). Current code, Linear, migrations, and live Supabase outrank this reference when they disagree about runtime state.

## Canonical ownership chain

```text
authenticated user
→ canonical landlord/broker identity
→ apartments.landlord_id
→ lead/showing tied to apartment
→ RPC/business authorization
→ Postgres constraints + RLS
```

Do not invent a second owner ID, broker mapping, lead store, or showing path.

## Rules

- Every requestable MDE rental must resolve to its legitimate canonical owner.
- Ownership must be revalidated at the authoritative backend/database boundary before a durable write.
- A broker sees or mutates only rows permitted by the canonical ownership model.
- Renter-facing eligibility/requestability and broker authorization are separate checks.
- Publishing must fail closed: drafts/imports do not become active merely because a field/default is missing.
- Listing facts and provenance remain grounded; broker entry does not authorize invented coordinates, images, price, availability, or verification.

## Viewing commitment

Schedule Viewing is a compound business outcome, not two unrelated inserts:

```text
authenticated renter
→ requestable owned apartment
→ authorized typed business capability
→ canonical atomic mutation
→ exactly 1 lead + exactly 1 linked showing
→ truthful success response
```

Reuse the existing atomic viewing path. A retry uses the same logical idempotency identity and must not duplicate either record. Partial lead-only or showing-only success is failure.

## Security proof

Reuse the repository's shared rental fixtures/harness. Prove:

- anon: no private broker data;
- authenticated renter: no broker privileges;
- owning broker: allowed only for owned resources;
- unrelated broker: denied for the same resources;
- admin/service role: behavior explicitly asserted, never used as proof of ordinary authorization;
- denied writes prove the real authorization failure;
- cleanup is re-queried and leaves zero test residue.

## AI/broker assistance

AI may summarize or draft from authorized, grounded data. It must not bypass RLS/RPC authorization, silently publish inventory, fabricate lead facts, or perform sensitive changes merely because the model requested them.

Use [sub-agents/lead-qualifier.md](sub-agents/lead-qualifier.md) only for optional advisory prioritization when the owning task explicitly needs it; it is not an authorization, requestability, or rental-eligibility engine.
