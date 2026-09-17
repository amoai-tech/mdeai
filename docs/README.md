# MDE AI Documentation

This is the **canonical entry point for active MDE AI documentation**.

## Source of truth

Use this order when documents disagree:

1. **Linear MDE AI project** — live task status, priority, ownership, and sequencing.
2. **Merged GitHub `main`** — shipped implementation truth.
3. **`src/app`** — implemented page/API route truth.
4. **Source code, Supabase migrations, manifests, and tests** — runtime, schema, dependency, and verification truth.
5. **Active documentation** — explains the verified product and architecture; it must not override the sources above.
6. **`docs/_archive/`** — historical evidence only, not current product truth.

> Rewrite active docs from **current code + current Linear + merged GitHub `main`**. Do not copy old paths, SHAs, percentages, route claims, or implementation status without re-verifying them.

## Start here

| Need | Document |
|---|---|
| Repository overview and local development | [`../README.md`](../README.md) |
| Product requirements | [`../prd.md`](../prd.md) |
| Product strategy and sequencing | [`../roadmap.md`](../roadmap.md) |
| System architecture | [`02-architecture/system-overview.md`](02-architecture/system-overview.md) |
| Documentation migration/audit status | [`index-docs.md`](index-docs.md) |
| Live execution status | [Linear — MDE AI](https://linear.app/amo100/project/mde-ai-bb25cababf6c/issues) |

## Documentation map

```text
docs/
├── README.md                 # this file — canonical docs router
├── 01-product/               # product behavior, journeys, requirements
├── 02-architecture/          # system architecture and durable decisions
├── 03-platform/              # shared technology and platform capabilities
├── 04-domains/               # events, rentals, venues, discovery, trips, partners
├── 05-design/                # design system, UX patterns, responsive behavior
├── 06-testing/               # test strategy, release verification, QA
├── 07-operations/            # local dev, deployment, security, observability, runbooks
├── 08-strategy/              # business, market, revenue, research
└── _archive/                 # superseded historical material
```

## 01 — Product

[`01-product/`](01-product/README.md)

Owns durable product behavior:

- product overview;
- user journeys;
- requirements;
- page/route intent;
- success criteria.

Live status belongs in Linear, not product docs.

## 02 — Architecture

[`02-architecture/`](02-architecture/README.md)

Current architecture:

- [`system-overview.md`](02-architecture/system-overview.md) — current end-to-end system map;
- frontend/backend boundaries;
- AI runtime;
- data and trust boundaries;
- architectural decisions.

Every architecture claim must be checked against merged `main`.

## 03 — Platform

[`03-platform/`](03-platform/README.md)

Shared platform capabilities such as:

- Next.js + React;
- CopilotKit / AG-UI;
- Mastra agents, tools, workflows, and memory;
- Supabase Auth/Postgres/RLS;
- Gemini;
- Google Maps / Places;
- payment and commerce integrations;
- shared observability and runtime services.

Platform docs describe capabilities and boundaries, not feature backlog.

## 04 — Domains

[`04-domains/`](04-domains/README.md)

Canonical homes:

- [`events/`](04-domains/events/README.md)
- [`rentals/`](04-domains/rentals/README.md)
- [`venues/`](04-domains/venues/README.md)
- [`restaurants/`](04-domains/restaurants/README.md)
- [`cafes-nightlife/`](04-domains/cafes-nightlife/README.md)
- [`trips/`](04-domains/trips/README.md)
- [`partners/`](04-domains/partners/README.md)
- [`ecommerce/`](04-domains/ecommerce/README.md)

Each domain should document only what it needs: current journeys, routes, data, agents/tools/workflows, operations, and clearly marked planned capabilities.

## 05 — Design

[`05-design/`](05-design/README.md)

Use for current design system, interaction patterns, three-panel behavior, responsive rules, and verified design references.

## 06 — Testing

[`06-testing/`](06-testing/README.md)

Use for reusable verification guidance:

- Vitest;
- Playwright;
- API/runtime tests;
- production smoke tests;
- release gates;
- evidence standards.

Historical one-off evidence belongs in archive/evidence locations rather than the canonical testing guide.

## 07 — Operations

[`07-operations/`](07-operations/README.md)

Use for:

- local development;
- deployment;
- environment setup;
- security operations;
- observability;
- troubleshooting;
- incident/recovery runbooks.

## 08 — Strategy

[`08-strategy/`](08-strategy/README.md)

Use for current business, market, revenue, partnership, research, and experiment strategy.

Strategy docs must not duplicate the live engineering queue.

## Archive policy

[`_archive/`](./_archive/README.md) preserves useful historical decisions, audits, migrations, acceptance evidence, and superseded documents.

Archive before deletion when history may still matter. Delete only material proven to be generated, temporary, empty, or an exact duplicate with no durable value.

## Documentation rules

1. **Code before prose.** Verify current behavior before documenting it.
2. **Linear before status prose.** Do not maintain a second task tracker in Markdown.
3. **Routes come from `src/app`.** Do not infer route existence from old plans.
4. **Schema comes from migrations/current database evidence.** Do not invent tables or fields from PRDs.
5. **Implemented vs planned must be explicit.** Never present roadmap intent as shipped behavior.
6. **Prefer one canonical document per topic.** Merge or archive duplicates after the replacement is verified.
7. **Use relative links for repository docs.** Avoid machine-specific absolute paths.
8. **Keep docs navigational.** Detailed implementation truth belongs close to source code/tests when appropriate.

## Current documentation migration

The numbered structure is being introduced incrementally. Legacy folders remain until their useful content is audited and either rewritten, merged, or archived.

Do not bulk-move or delete legacy documentation merely to make the tree look clean.
