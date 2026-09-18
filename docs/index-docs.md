---
title: MDE AI documentation index
updated: 2026-09-18
status: canonical index
source_of_truth: Linear for live work; merged main for shipped code; src/app for implemented routes
---

# MDE AI documentation index

This is the canonical navigation index for active MDE AI documentation on `main`.

## Source-of-truth rules

1. Linear MDE AI owns live task status, priority, and execution order.
2. Merged `main` owns shipped repository truth.
3. `src/app` owns implemented route truth.
4. Code, migrations, package manifests, and tests own implementation truth.
5. Active docs explain current product, architecture, operations, and strategy.
6. Historical audits, task exports, evidence, notes, and superseded plans belong under `docs/_archive/`.

## Start here

| Need | Canonical location | Status |
|---|---|---|
| Documentation overview | [README.md](README.md) | Current |
| Product | [01-product/](01-product/) | Current / expanding |
| Architecture | [02-architecture/](02-architecture/) | Current |
| Platform | [03-platform/](03-platform/) | Current / expanding |
| Domains | [04-domains/](04-domains/) | Current / expanding |
| Design | [05-design/](05-design/) | Current / migrating legacy content |
| Testing | [06-testing/](06-testing/) | Current / expanding |
| Operations | [07-operations/](07-operations/) | Current / expanding |
| Strategy | [08-strategy/](08-strategy/) | Current / consolidating |
| Historical material | [_archive/](_archive/) | Historical only |

## Canonical documentation architecture

```text
docs/
├── README.md
├── index-docs.md
├── 01-product/
├── 02-architecture/
├── 03-platform/
├── 04-domains/
├── 05-design/
├── 06-testing/
├── 07-operations/
├── 08-strategy/
└── _archive/
```

## Current canonical areas

### Product
[01-product/README.md](01-product/README.md)

Use for current product definition, user journeys, PRD-level intent, and durable roadmap intent. Do not maintain a competing live task queue here.

### Architecture
[02-architecture/README.md](02-architecture/README.md)

Current architecture includes:
- [system-overview.md](02-architecture/system-overview.md)
- [data-model.md](02-architecture/data-model.md)
- [schema-ownership.md](02-architecture/schema-ownership.md)
- [migration-drift.md](02-architecture/migration-drift.md)
- [edge-functions.md](02-architecture/edge-functions.md)

Dated evidence belongs under [02-architecture/snapshots/](02-architecture/snapshots/).

### Platform
[03-platform/README.md](03-platform/README.md)

Use for shared Next.js, CopilotKit, Mastra, Supabase, Gemini, Maps, Stripe, Cloudinary, and runtime integration guidance.

### Domains
[04-domains/README.md](04-domains/README.md)

Canonical homes:
- [Events](04-domains/events/)
- [Venues](04-domains/venues/)
- [Rentals](04-domains/rentals/)
- [Restaurants](04-domains/restaurants/)
- [Cafes and Nightlife](04-domains/cafes-nightlife/)
- [Trips](04-domains/trips/)
- [Partners and Sponsors](04-domains/partners/)
- [Ecommerce](04-domains/ecommerce/)

Legacy domain folders remain only while verified current content is being migrated.

### Design
[05-design/README.md](05-design/README.md)

Use for current design-system rules, UX patterns, navigation, responsive behavior, and current wireframes.

### Testing
[06-testing/README.md](06-testing/README.md)

Use for reusable test guidance, QA, release verification, and production smoke procedures.

### Operations
[07-operations/README.md](07-operations/README.md)

Use for local development, deployment, security operations, observability, runbooks, and troubleshooting.

### Strategy
[08-strategy/README.md](08-strategy/README.md)

Use for current business, market, revenue, and experiment strategy. Historical research belongs in the archive.

## Legacy migration status

The following content is no longer active documentation:

- `docs/dashboard.md`
- `docs/task-backlog.md`
- `docs/todo.md`
- `docs/linear/`
- most of `docs/tasks/`
- `docs/notes/`
- `docs/upgradeV2/`
- historical feature audit/evidence/note folders
- exact duplicate files formerly under `docs/strategy/design/`

These have been archived under:

`docs/_archive/legacy-active-docs-2026-09-18/`

Only exact duplicate files were removed outright. Non-duplicate historical material is preserved for reference.

## Active legacy areas still awaiting consolidation

These remain active temporarily because they contain non-duplicate material that must be reviewed before migration:

- `docs/design/`
- `docs/ecommerce/`
- `docs/partners/`
- `docs/prd/`
- `docs/real-estate/`
- `docs/restaurant/`
- `docs/research/`
- `docs/strategy/`
- `docs/wireframes/`
- `docs/copilotkit-mastra/`
- `docs/ai-second-brain/`

Do not treat these legacy locations as authoritative when they conflict with canonical docs, merged code, or Linear.

## Stale-content rules

Active docs must not present these as current truth:

- old repository references such as `amo-tech-ai/mdeapp`;
- assumptions that `/home/sk/mdeai/mdeapp` is the repository root;
- retired skill names such as `mde-real-estate` and `mde-maps`;
- hard-coded live task status/order that duplicates Linear;
- stale commit SHAs/readiness percentages presented as evergreen facts;
- route claims that conflict with current `src/app`.

Historical archived files may preserve old names, paths, and status snapshots when clearly historical.

## Documentation decision rules

Classify docs as:

- CURRENT — accurate and canonical today.
- UPDATE — useful but contains stale facts.
- MERGE — useful content duplicated across multiple files.
- ARCHIVE — historical/superseded but still worth preserving.
- REMOVE — exact duplicate, generated, temporary, or empty with proof.
- UNKNOWN-PRESERVE — unclear value; keep until resolved.

## Cleanup progress

| Area | Status |
|---|---|
| Canonical folder structure | ✅ Done |
| Architecture docs | ✅ Current |
| Root live-status docs | ✅ Archived |
| Linear exports | ✅ Archived |
| Session notes | ✅ Archived |
| UpgradeV2 history | ✅ Archived |
| Most task-history docs | ✅ Archived |
| Feature audit/evidence/notes | ✅ Archived where clearly historical |
| `strategy/design` exact duplicates | ✅ Removed after hash verification |
| Legacy design/domain/platform consolidation | 🟡 In progress |
| Drift-prevention checks | 🔵 Next |

Linear project: https://linear.app/amo100/project/mde-ai-bb25cababf6c/issues

Repository: https://github.com/amoai-tech/mdeai

Production: https://www.mdeai.co/
