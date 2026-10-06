---
name: real-estate-tech
description: Use when MDE work explicitly requires MLS, IDX, RETS, RESO Web API, AVM/comparable-sales systems, large-scale listing feeds, or geospatial/search architecture proven to exceed the current rental stack.
metadata:
  source: https://github.com/rohitg00/awesome-claude-code-toolkit/blob/main/agents/specialized-domains/real-estate-tech.md
  origin: external + MDE adaptations
  scope: future MLS/IDX and proven scale work only
---

# Future MLS / IDX Scale

This is optional future-scale reference material. It is **not** the guide for normal `RENTV2` work.

## Load only for an explicit need

Use this file when the owning task requires one of:

- MLS / IDX / RETS / RESO Web API integration;
- a large external listing-feed architecture;
- AVM or comparable-sales systems;
- server-side geospatial/search scale that current measured load cannot support.

A `RENTV2` label, external-discovery fallback, trust/dedupe task, saved search, ordinary PostGIS use, or more than one source does not by itself justify this architecture.

For current MDE rental discovery/viewing work, use [rental-mvp.md](rental-mvp.md).

## Scale rules

1. Measure the current bottleneck before introducing new infrastructure.
2. Reuse MDE's canonical rental identity, `RentalEligibility`, `RentalResult`, ownership, provenance, and requestability contracts.
3. Feed ingestion must be idempotent and preserve source identity/provenance/freshness.
4. External facts remain unknown until verified; aggregation does not make a fact true.
5. Deduplication must be conservative and auditable; never merge physical properties on an AI guess.
6. Preserve source licensing/attribution and provider terms.
7. Prefer Postgres/PostGIS and existing search infrastructure until measured requirements justify another service.
8. MLS/feed ingestion never grants an external listing MDE ownership or the **Schedule Viewing** action.

## Typical future patterns

### Feed ingestion

For a licensed feed, use a stable provider/listing identity and idempotent upsert semantics. Normalize into the same canonical rental contracts consumed by current search/UI rather than creating a parallel marketplace.

### Geospatial scale

Use PostGIS spatial types/indexes and bounded server-side queries when real data volume makes client-side rendering/querying inadequate. Choose clustering/search techniques from measured dataset and viewport behavior, not a hard-coded listing-count threshold.

### AVM / comparables

Do not ship valuation logic until the product has a concrete use case, legitimate comparable data, an evaluation set, uncertainty handling, and a disclosure/grounding contract. A model-generated number is not evidence of market value.

### Search escalation

Keep deterministic eligibility separate from retrieval/ranking. Only introduce an external search engine when Postgres/current architecture fails a measured correctness/latency/scale requirement and the owning task documents that evidence.

## Colombia/MDE grounding

Generic MLS/US examples are architectural references only. Verify Colombian data rights, brokerage/consumer rules, privacy requirements, local address/measurement conventions, and provider terms from authoritative current sources before turning any generic pattern into a product requirement.
