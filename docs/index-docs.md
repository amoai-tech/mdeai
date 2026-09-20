---
title: MDE AI documentation index
updated: 2026-09-20
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
| Design | [05-design/](05-design/) | Current |
| Testing | [06-testing/](06-testing/) | Current / expanding |
| Operations | [07-operations/](07-operations/) | Current / expanding |
| Strategy | [08-strategy/](08-strategy/) | Current |
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
├── tasks/                  # INDEX.md and CONVENTIONS.md only
└── _archive/
```


## Allowed top-level documentation

Active documentation at `docs/` root is intentionally limited to:

- `README.md`
- `index-docs.md`
- numbered canonical directories `01-product/` through `08-strategy/`
- `tasks/` for durable task authoring conventions only
- `_archive/` for historical material

Other top-level documentation files or directories are drift and must move into a numbered canonical home or `_archive/`.

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

Legacy top-level domain folders have been consolidated or archived; numbered domain docs are canonical.

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

## Complete active documentation catalog

This table lists **every active documentation file currently under `docs/`** on `main` (125 files). It includes Markdown, HTML wireframes, and JSON architecture snapshots. Obsidian workspace files, binary assets, and historical material under `_archive/` are intentionally excluded from the active-doc catalog.

| Area | Document | Type | Status |
|---|---|---|---|
| Product | [`01-product/README.md`](01-product/README.md) | Markdown | Current |
| Architecture | [`02-architecture/README.md`](02-architecture/README.md) | Markdown | Current |
| Architecture | [`02-architecture/data-model.md`](02-architecture/data-model.md) | Markdown | Current |
| Architecture | [`02-architecture/edge-functions.md`](02-architecture/edge-functions.md) | Markdown | Current |
| Architecture | [`02-architecture/migration-drift.md`](02-architecture/migration-drift.md) | Markdown | Current |
| Architecture | [`02-architecture/schema-ownership.md`](02-architecture/schema-ownership.md) | Markdown | Current |
| Architecture | [`02-architecture/snapshots/advisors-2026-09-17.json`](02-architecture/snapshots/advisors-2026-09-17.json) | JSON snapshot | Snapshot / evidence |
| Architecture | [`02-architecture/snapshots/baseline-replay-audit-2026-09-17.md`](02-architecture/snapshots/baseline-replay-audit-2026-09-17.md) | Markdown | Snapshot / evidence |
| Architecture | [`02-architecture/snapshots/generated-types-drift-2026-09-17.md`](02-architecture/snapshots/generated-types-drift-2026-09-17.md) | Markdown | Snapshot / evidence |
| Architecture | [`02-architecture/snapshots/privileged-functions-2026-09-17.json`](02-architecture/snapshots/privileged-functions-2026-09-17.json) | JSON snapshot | Snapshot / evidence |
| Architecture | [`02-architecture/snapshots/sb-002-schema-gap-inventory-2026-09-17.md`](02-architecture/snapshots/sb-002-schema-gap-inventory-2026-09-17.md) | Markdown | Snapshot / evidence |
| Architecture | [`02-architecture/snapshots/schema-exposure-2026-09-17.json`](02-architecture/snapshots/schema-exposure-2026-09-17.json) | JSON snapshot | Snapshot / evidence |
| Architecture | [`02-architecture/system-overview.md`](02-architecture/system-overview.md) | Markdown | Current |
| Platform | [`03-platform/README.md`](03-platform/README.md) | Markdown | Current |
| Platform | [`03-platform/copilotkit-mastra/README.md`](03-platform/copilotkit-mastra/README.md) | Markdown | Current |
| Platform | [`03-platform/copilotkit-mastra/diagrams.md`](03-platform/copilotkit-mastra/diagrams.md) | Markdown | Current |
| Platform | [`03-platform/copilotkit-mastra/reference-pack.md`](03-platform/copilotkit-mastra/reference-pack.md) | Markdown | Current |
| Platform | [`03-platform/copilotkit-mastra/roadmap.md`](03-platform/copilotkit-mastra/roadmap.md) | Markdown | Current |
| Domains | [`04-domains/README.md`](04-domains/README.md) | Markdown | Current |
| Domains | [`04-domains/cafes-nightlife/README.md`](04-domains/cafes-nightlife/README.md) | Markdown | Current |
| Domains | [`04-domains/ecommerce/README.md`](04-domains/ecommerce/README.md) | Markdown | Current |
| Domains | [`04-domains/ecommerce/api-contract.md`](04-domains/ecommerce/api-contract.md) | Markdown | Current |
| Domains | [`04-domains/ecommerce/architecture.md`](04-domains/ecommerce/architecture.md) | Markdown | Current |
| Domains | [`04-domains/ecommerce/environment.md`](04-domains/ecommerce/environment.md) | Markdown | Current |
| Domains | [`04-domains/ecommerce/product.md`](04-domains/ecommerce/product.md) | Markdown | Current |
| Domains | [`04-domains/events/README.md`](04-domains/events/README.md) | Markdown | Current |
| Domains | [`04-domains/partners/README.md`](04-domains/partners/README.md) | Markdown | Current |
| Domains | [`04-domains/partners/ai-services.md`](04-domains/partners/ai-services.md) | Markdown | Current |
| Domains | [`04-domains/partners/concierge.md`](04-domains/partners/concierge.md) | Markdown | Current |
| Domains | [`04-domains/partners/dashboard.md`](04-domains/partners/dashboard.md) | Markdown | Current |
| Domains | [`04-domains/partners/growth.md`](04-domains/partners/growth.md) | Markdown | Current |
| Domains | [`04-domains/partners/journey-maps.md`](04-domains/partners/journey-maps.md) | Markdown | Current |
| Domains | [`04-domains/partners/landing-pages.md`](04-domains/partners/landing-pages.md) | Markdown | Current |
| Domains | [`04-domains/partners/marketing-automation.md`](04-domains/partners/marketing-automation.md) | Markdown | Current |
| Domains | [`04-domains/partners/marketplace.md`](04-domains/partners/marketplace.md) | Markdown | Current |
| Domains | [`04-domains/partners/payments-revenue.md`](04-domains/partners/payments-revenue.md) | Markdown | Current |
| Domains | [`04-domains/partners/product.md`](04-domains/partners/product.md) | Markdown | Current |
| Domains | [`04-domains/rentals/README.md`](04-domains/rentals/README.md) | Markdown | Current |
| Domains | [`04-domains/restaurants/README.md`](04-domains/restaurants/README.md) | Markdown | Current |
| Domains | [`04-domains/trips/README.md`](04-domains/trips/README.md) | Markdown | Current |
| Domains | [`04-domains/venues/README.md`](04-domains/venues/README.md) | Markdown | Current |
| Design | [`05-design/README.md`](05-design/README.md) | Markdown | Current |
| Design | [`05-design/component-mapping.md`](05-design/component-mapping.md) | Markdown | Current |
| Design | [`05-design/concierge-direction.md`](05-design/concierge-direction.md) | Markdown | Current |
| Design | [`05-design/design-process.md`](05-design/design-process.md) | Markdown | Current |
| Design | [`05-design/design-system.md`](05-design/design-system.md) | Markdown | Current |
| Design | [`05-design/foundations.md`](05-design/foundations.md) | Markdown | Current |
| Design | [`05-design/images.md`](05-design/images.md) | Markdown | Current |
| Design | [`05-design/marketing-pages.md`](05-design/marketing-pages.md) | Markdown | Current |
| Design | [`05-design/patterns/discovery.md`](05-design/patterns/discovery.md) | Markdown | Current |
| Design | [`05-design/patterns/whatsapp-mobile.md`](05-design/patterns/whatsapp-mobile.md) | Markdown | Current |
| Design | [`05-design/screens/mockups/cafes.html`](05-design/screens/mockups/cafes.html) | HTML wireframe | Current |
| Design | [`05-design/screens/mockups/dashboard.html`](05-design/screens/mockups/dashboard.html) | HTML wireframe | Current |
| Design | [`05-design/screens/mockups/explore.html`](05-design/screens/mockups/explore.html) | HTML wireframe | Current |
| Design | [`05-design/screens/mockups/venue.html`](05-design/screens/mockups/venue.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/about-wireframe.html`](05-design/screens/partners/about-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/business-ai-wireframe.html`](05-design/screens/partners/business-ai-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/business-hub-wireframe.html`](05-design/screens/partners/business-hub-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/contact-wireframe.html`](05-design/screens/partners/contact-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/host-wireframe.html`](05-design/screens/partners/host-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/partner-signup-wireframe.html`](05-design/screens/partners/partner-signup-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/partners-hub-wireframe.html`](05-design/screens/partners/partners-hub-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/partners-rentals-wireframe.html`](05-design/screens/partners/partners-rentals-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/pricing-wireframe.html`](05-design/screens/partners/pricing-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/sponsors-wireframe.html`](05-design/screens/partners/sponsors-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/partners/venues-wireframe.html`](05-design/screens/partners/venues-wireframe.html) | HTML wireframe | Current |
| Design | [`05-design/screens/product-wireframes/README.md`](05-design/screens/product-wireframes/README.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/_arch/agents.md`](05-design/screens/product-wireframes/_arch/agents.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/_arch/copilotkit.md`](05-design/screens/product-wireframes/_arch/copilotkit.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/_arch/workflows.md`](05-design/screens/product-wireframes/_arch/workflows.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/_layout/navigation.md`](05-design/screens/product-wireframes/_layout/navigation.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/_layout/three-panel.md`](05-design/screens/product-wireframes/_layout/three-panel.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/admin/001-ops-dashboard.md`](05-design/screens/product-wireframes/admin/001-ops-dashboard.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/admin/002-analytics-dashboard.md`](05-design/screens/product-wireframes/admin/002-analytics-dashboard.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/auth/001-login.md`](05-design/screens/product-wireframes/auth/001-login.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/auth/002-signup.md`](05-design/screens/product-wireframes/auth/002-signup.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/cafes/001-cafe-search.md`](05-design/screens/product-wireframes/cafes/001-cafe-search.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/consumer/001-home.md`](05-design/screens/product-wireframes/consumer/001-home.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/consumer/002-saved-items.md`](05-design/screens/product-wireframes/consumer/002-saved-items.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/consumer/003-user-profile.md`](05-design/screens/product-wireframes/consumer/003-user-profile.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/consumer/004-explore-map.md`](05-design/screens/product-wireframes/consumer/004-explore-map.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/crm/001-leads-pipeline.md`](05-design/screens/product-wireframes/crm/001-leads-pipeline.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/events/001-event-discovery.md`](05-design/screens/product-wireframes/events/001-event-discovery.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/events/002-event-details.md`](05-design/screens/product-wireframes/events/002-event-details.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/events/003-event-checkout.md`](05-design/screens/product-wireframes/events/003-event-checkout.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/events/004-ticket-wallet.md`](05-design/screens/product-wireframes/events/004-ticket-wallet.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/hosts/001-host-dashboard.md`](05-design/screens/product-wireframes/hosts/001-host-dashboard.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/hosts/002-create-event.md`](05-design/screens/product-wireframes/hosts/002-create-event.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/hosts/003-ticket-management.md`](05-design/screens/product-wireframes/hosts/003-ticket-management.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/hosts/004-attendee-management.md`](05-design/screens/product-wireframes/hosts/004-attendee-management.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/nightlife/001-nightclub-discovery.md`](05-design/screens/product-wireframes/nightlife/001-nightclub-discovery.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/rental-hosts/001-rental-dashboard.md`](05-design/screens/product-wireframes/rental-hosts/001-rental-dashboard.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/rentals/001-rental-search.md`](05-design/screens/product-wireframes/rentals/001-rental-search.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/rentals/002-rental-details.md`](05-design/screens/product-wireframes/rentals/002-rental-details.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/rentals/003-inquiry-viewing.md`](05-design/screens/product-wireframes/rentals/003-inquiry-viewing.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/restaurants/001-restaurant-search.md`](05-design/screens/product-wireframes/restaurants/001-restaurant-search.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/sponsors/001-sponsor-dashboard.md`](05-design/screens/product-wireframes/sponsors/001-sponsor-dashboard.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/venue-owners/001-venue-dashboard.md`](05-design/screens/product-wireframes/venue-owners/001-venue-dashboard.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/venues/001-venue-search.md`](05-design/screens/product-wireframes/venues/001-venue-search.md) | Markdown | Current |
| Design | [`05-design/screens/product-wireframes/venues/002-venue-details.md`](05-design/screens/product-wireframes/venues/002-venue-details.md) | Markdown | Current |
| Testing | [`06-testing/README.md`](06-testing/README.md) | Markdown | Current |
| Testing | [`06-testing/localhost-qa-runbook.md`](06-testing/localhost-qa-runbook.md) | Markdown | Current |
| Testing | [`06-testing/pr-review-guidelines.md`](06-testing/pr-review-guidelines.md) | Markdown | Current |
| Testing | [`06-testing/ui-verification.md`](06-testing/ui-verification.md) | Markdown | Current |
| Operations | [`07-operations/README.md`](07-operations/README.md) | Markdown | Current |
| Operations | [`07-operations/graphify-reference.md`](07-operations/graphify-reference.md) | Markdown | Current |
| Operations | [`07-operations/security/dist-leak-scan-maps-key-allowlist.md`](07-operations/security/dist-leak-scan-maps-key-allowlist.md) | Markdown | Current |
| Operations | [`07-operations/security/supabase-advisor-disposition.md`](07-operations/security/supabase-advisor-disposition.md) | Markdown | Current |
| Strategy | [`08-strategy/README.md`](08-strategy/README.md) | Markdown | Current |
| Strategy | [`08-strategy/ai-services.md`](08-strategy/ai-services.md) | Markdown | Current |
| Strategy | [`08-strategy/financial-model.md`](08-strategy/financial-model.md) | Markdown | Current |
| Strategy | [`08-strategy/growth-strategy.md`](08-strategy/growth-strategy.md) | Markdown | Current |
| Strategy | [`08-strategy/market-research.md`](08-strategy/market-research.md) | Markdown | Current |
| Strategy | [`08-strategy/marketplace-strategy.md`](08-strategy/marketplace-strategy.md) | Markdown | Current |
| Strategy | [`08-strategy/partnerships-strategy.md`](08-strategy/partnerships-strategy.md) | Markdown | Current |
| Strategy | [`08-strategy/prioritization.md`](08-strategy/prioritization.md) | Markdown | Current |
| Strategy | [`08-strategy/product-strategy.md`](08-strategy/product-strategy.md) | Markdown | Current |
| Strategy | [`08-strategy/revenue-strategy.md`](08-strategy/revenue-strategy.md) | Markdown | Current |
| Strategy | [`08-strategy/subscription-plans.md`](08-strategy/subscription-plans.md) | Markdown | Current |
| Root | [`README.md`](README.md) | Markdown | Current |
| Root | [`index-docs.md`](index-docs.md) | Markdown | Canonical index |
| Active plans/specs | [`superpowers/plans/2026-09-19-san-1332-pr-agent-evidence.md`](superpowers/plans/2026-09-19-san-1332-pr-agent-evidence.md) | Markdown | Active task-specific plan/spec |
| Active plans/specs | [`superpowers/specs/2026-09-19-san-1332-pr-agent-evidence-design.md`](superpowers/specs/2026-09-19-san-1332-pr-agent-evidence-design.md) | Markdown | Active task-specific plan/spec |
| Task conventions | [`tasks/CONVENTIONS.md`](tasks/CONVENTIONS.md) | Markdown | Current convention/index |
| Task conventions | [`tasks/INDEX.md`](tasks/INDEX.md) | Markdown | Current convention/index |

### Historical archive

| Location | Status | Notes |
|---|---|---|
| [`_archive/`](_archive/) | Historical only | Preserved audits, task exports, evidence, notes, superseded plans, generated artifacts, and legacy code snapshots. Not part of the active documentation set. |
| [`_archive/README.md`](_archive/README.md) | Historical index/readme | Entry point for archived material. |

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

## Legacy consolidation status

The former top-level legacy trees for strategy, partners, design, ecommerce, Linear exports, PRDs, real estate, restaurants, research, wireframes, CopilotKit/Mastra planning, and AI Second Brain are no longer active documentation.

Durable current material was moved into the numbered canonical structure. Historical, task-specific, dated research, audits, prompts, and superseded plans are preserved under `docs/_archive/`.

A repository check prevents deprecated top-level documentation trees from being recreated and validates relative links in active canonical Markdown.

## Stale-content rules

Active docs must not present these as current truth:

- old repository references such as `amo-tech-ai/mdeapp`;
- assumptions that `/home/sk/mdeai/mdeapp` is the repository root;
- retired or superseded skill aliases that duplicate canonical domain skills;
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
| Legacy design/domain/platform consolidation | ✅ Done |
| Drift-prevention checks | ✅ Active (`npm run check:docs`) |

Linear project: https://linear.app/amo100/project/mde-ai-bb25cababf6c/issues

Repository: https://github.com/amoai-tech/mdeai

Production: https://www.mdeai.co/
