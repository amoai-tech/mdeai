# MDE Rentals / Real Estate — Reference & Planning Index

One page to find the current Real Estate docs, Linear plans/tasks, reference repos, and the next docs worth creating.

## Table of contents

1. [Start here](#1--start-here)
2. [Canonical GitHub docs](#2--canonical-github-docs)
3. [Linear planning and task views](#3--linear-planning-and-task-views)
4. [Core/MVP task map](#4--coremvp-task-map)
5. [Shared platform docs](#5--shared-platform-docs)
6. [Reference repos and local clones](#6--reference-repos-and-local-clones)
7. [Docs to create next](#7--docs-to-create-next)
8. [Strategy and advanced work](#8--strategy-and-advanced-work)
9. [Source-of-truth rules](#9--source-of-truth-rules)
10. [How to keep this index current](#10--how-to-keep-this-index-current)

## 1 · Start here

For Core/MVP, read in this order:

1. [`RENTALS.md`](./RENTALS.md) — what MDE Rentals does and the target Core/MVP journey.
2. [`REUSE-MATRIX.md`](./REUSE-MATRIX.md) — what MDE keeps, adapts, models, references, or skips.
3. [`REFERENCES.md`](./REFERENCES.md) — the repo/template catalog and exactly what MDE takes from each source.
4. [Linear Real Estate view](https://linear.app/amo100/view/real-estate-mde-61c961d1bd58) — live task status and sequencing.
5. [MDE AI project](https://linear.app/amo100/project/mde-ai-bb25cababf6c) — project milestones and cross-platform blockers.

Core/MVP journey:

```text
search
→ compare
→ map
→ listing
→ viewing request
→ committed lead/showing
→ authorized broker follow-up
```

Do not make this journey depend on MCP, A2A, browser agents, deep research, observational memory, autonomous broker agents, or agent swarms.

## 2 · Canonical GitHub docs

| Document | Purpose | Status |
|---|---|---|
| [`INDEX.md`](./INDEX.md) | Navigation across docs, Linear, tasks, and references | Canonical index |
| [`README.md`](./README.md) | Small folder router and source-of-truth rules | Canonical |
| [`RENTALS.md`](./RENTALS.md) | Product, journeys, architecture, blockers, success criteria | Canonical |
| [`REUSE-MATRIX.md`](./REUSE-MATRIX.md) | KEEP / COPY / ADAPT / MODEL / REFERENCE / SKIP decisions | Canonical |
| [`REFERENCES.md`](./REFERENCES.md) | GitHub repos, official templates, local clones, and MDE adaptations | Canonical |

GitHub docs root:
https://github.com/amoai-tech/mdeai/tree/main/docs

Rentals folder on `main` after merge:
https://github.com/amoai-tech/mdeai/tree/main/docs/04-domains/rentals

## 3 · Linear planning and task views

### Main navigation

- MDE AI project: https://linear.app/amo100/project/mde-ai-bb25cababf6c
- Real Estate MDE view: https://linear.app/amo100/view/real-estate-mde-61c961d1bd58
- Rentals & Real Estate PRD + Roadmap: https://linear.app/amo100/document/mde-ai-rentals-and-real-estate-prd-roadmap-7881940afa3a
- MDE Product PRD: https://linear.app/amo100/document/mde-ai-product-requirements-document-dd9b302ec327
- MDE Product Roadmap: https://linear.app/amo100/document/mde-ai-product-roadmap-888fc22cc000
- Ordered Production Todo: https://linear.app/amo100/document/mde-ai-ordered-production-todo-97d23ef23d1e

### Shared AI/platform planning

- MDE Agent Platform PRD: https://linear.app/amo100/document/mde-agent-platform-prd-2d1bd0e59dbc
- MDE Agent Platform Roadmap: https://linear.app/amo100/document/mde-agent-platform-roadmap-886de8dab1ad
- MDE Reference Reuse Matrix: https://linear.app/amo100/document/mde-reference-reuse-matrix-883571644ed8
- MDE Agent Platform Migration Plan: https://linear.app/amo100/document/mde-agent-platform-migration-plan-5c76cd7d8032

### Data/security planning

- MDE Supabase Production Hardening: https://linear.app/amo100/document/mde-supabase-production-hardening-audit-and-fix-plan-34f9502b44f5

### Documentation governance

- Documentation index + cleanup map: https://linear.app/amo100/document/mde-ai-documentation-index-and-cleanup-map-5b15f46fc21b
- Documentation cleanup plan: https://linear.app/amo100/document/mde-documentation-audit-and-cleanup-plan-pr-108-3f81419eaf3f
- SAN-1271 canonical docs index: https://linear.app/amo100/issue/SAN-1271/san-1271-finish-the-canonical-docs-index-and-make-documentation-drift
- SAN-1278 domain docs: https://linear.app/amo100/issue/SAN-1278/task-47-mde-docs-domains-001-rewrite-current-domain-documentation
- SAN-1280 docs drift prevention: https://linear.app/amo100/issue/SAN-1280/task-49-mde-docs-drift-001-add-documentation-validation-and-drift

## 4 · Core/MVP task map

Use Linear for live status. This table explains ownership, not progress percentages.

| Area | Primary Linear task | What becomes true |
|---|---|---|
| Rental launch coordinator | [SAN-1315](https://linear.app/amo100/issue/SAN-1315/san-1315-finish-the-rental-journey-from-apartment-discovery-to) | Discovery → detail → committed viewing works as one journey |
| Rental readiness tracker | [SAN-1270](https://linear.app/amo100/issue/SAN-1270/san-1270-keep-the-rental-production-readiness-tracker-current) | One current rental readiness view |
| Viewing UI truth | [SAN-1203](https://linear.app/amo100/issue/SAN-1203/san-1203-make-a-viewing-request-count-only-after-the-database-commits) | UI confirms only after the DB commits |
| Atomic viewing write | [SAN-1286](https://linear.app/amo100/issue/SAN-1286/san-1286-make-rental-viewing-requests-one-atomic-database-write) | One atomic lead + showing write path |
| Lead capture proof | [SAN-474](https://linear.app/amo100/issue/SAN-474/san-474-re-007-prove-rental-lead-capture-through-the-real-edge-atomic) | Real edge/API path reaches the atomic write |
| Broker visibility | [SAN-476](https://linear.app/amo100/issue/SAN-476/real-009-prove-committed-showing-authorized-broker-visibility) | Correct broker sees committed showing |
| Host workspace | [SAN-1204](https://linear.app/amo100/issue/SAN-1204/re-des-009-host-workspace-surfaces-real-consumer-leads-viewings) | Real leads/viewings appear in host UI |
| End-to-end rental journey | [SAN-1205](https://linear.app/amo100/issue/SAN-1205/re-wire-004-prove-the-complete-rental-conversion-journey-end-to-end) | Full browser journey is proven |
| Production smoke | [SAN-483](https://linear.app/amo100/issue/SAN-483/real-016-final-production-rental-conversion-smoke-floor) | Production rental conversion stays green |
| Rental ownership model | [SAN-1104](https://linear.app/amo100/issue/SAN-1104/d-01-ptr-rentals-001-landlord-id-ownership-model) | Every rental has authoritative owner identity |
| Broker isolation | [SAN-1105](https://linear.app/amo100/issue/SAN-1105/d-02-ptr-rentals-002-broker-rls-two-user-test) | Broker A cannot read Broker B data |
| Production data boundary | [SAN-1349](https://linear.app/amo100/issue/SAN-1349/supa-re-015-close-rental-production-data-boundary-gaps) | Ownership/RLS/data gaps are closed |
| Rental test harness | [SAN-482](https://linear.app/amo100/issue/SAN-482/san-482-shared-rental-test-harness-fixtures-auth-states-and-rls-proof) | Repeatable renter/broker/RLS fixtures exist |
| Cards ↔ map sync | [SAN-472](https://linear.app/amo100/issue/SAN-472/san-472-re-005-map-pin-sync-with-rental-cards) | Cards and pins select the same listing |
| Inventory quality | [SAN-468](https://linear.app/amo100/issue/SAN-468/real-002-apartment-inventory-quality) | Core listings are trustworthy enough for MVP |
| Availability/date search | [SAN-486](https://linear.app/amo100/issue/SAN-486/real-019-rental-search-availability-date-filters) | Dates are deterministic search constraints |
| AI/data isolation | [SAN-547](https://linear.app/amo100/issue/SAN-547/san-547-keep-each-users-ai-tools-and-supabase-data-isolated) | User/thread/tool data stays isolated |
| AI safety | [SAN-1054](https://linear.app/amo100/issue/SAN-1054/san-1054-prove-rental-ai-cannot-leak-prompts-data-or-perform) | Rental AI cannot leak or perform unauthorized actions |

## 5 · Shared platform docs

Do not duplicate these inside rentals. Link to them.

- CopilotKit + Mastra platform README: https://github.com/amoai-tech/mdeai/blob/main/docs/03-platform/copilotkit-mastra/README.md
- Platform diagrams: https://github.com/amoai-tech/mdeai/blob/main/docs/03-platform/copilotkit-mastra/diagrams.md
- Official reference pack: https://github.com/amoai-tech/mdeai/blob/main/docs/03-platform/copilotkit-mastra/reference-pack.md
- Platform roadmap: https://github.com/amoai-tech/mdeai/blob/main/docs/03-platform/copilotkit-mastra/roadmap.md

Platform tasks that can affect Rentals:

- CopilotKit standardization: https://linear.app/amo100/issue/SAN-1298/task-53ck-mde-copilotkit-epic-001-standardize-copilotkit-ui-shared
- Mastra runtime standardization: https://linear.app/amo100/issue/SAN-1299/san-1299-standardize-the-mastra-runtime-before-adding-more-agents-or
- CopilotKit audit guard: https://linear.app/amo100/issue/SAN-1300/task-5510-mde-ck-guard-001-repair-copilotkit-audit-guardrail
- Mastra storage certification: https://linear.app/amo100/issue/SAN-1311/task-5410-mde-mastra-storage-cert-001-certify-mastra-storage-for
- Chat memory durability: https://linear.app/amo100/issue/SAN-548/san-548-prove-chat-memory-survives-a-vercel-restart

## 6 · Reference repos and local clones

### Local clone cache

Use local clones for source inspection instead of repeatedly browsing moving `main` branches.

| Source | Local path | Main MDE use |
|---|---|---|
| CopilotKit | `/home/sk/github-repos/copilotkit/CopilotKit` | Mastra integration, shared state, GenUI patterns |
| Mastra monorepo | `/home/sk/github-repos/mastra/mastra` | Native agents/tools/workflows/storage APIs |
| Mastra Agent Harness | `/home/sk/github-repos/mastra/template-agent-harness` | Advanced governance reference; not Core/MVP requirement |
| Mastra Browsing Agent | `/home/sk/github-repos/mastra/template-browsing-agent` | Future external verification reference |
| Mastra Company Knowledge | `/home/sk/github-repos/mastra/template-company-knowledge` | Future grounded knowledge reference |
| Mastra Deep Search | `/home/sk/github-repos/mastra/template-deep-search` | Future neighborhood/market research reference |
| Mastra Text-to-SQL | `/home/sk/github-repos/mastra/template-text-to-sql` | Broker/admin analytics model only |
| OpenBot | `/home/sk/github-repos/copilotkit/OpenBot` | Advanced broker coworker reference; not Core/MVP |
| Mastra Supabase starter | `/home/sk/github-repos/community/mastra-supabase-starter` | Supabase integration comparison |
| Mastra auth examples | `/home/sk/github-repos/mastra/mastra-auth-examples` | Auth pattern comparison |
| Observational memory workshop | `/home/sk/github-repos/mastra/mastra-observational-memory-workshop` | Advanced-only memory research |

Real Estate Core/MVP clones:

| Repo | Local path | Main MDE use |
|---|---|---|
| Dubai Real Estate | `/home/sk/github-repos/real-estate/dubai-real-estate` | SQL-first hard truth before AI ranking |
| HomeRecoEngine | `/home/sk/github-repos/real-estate/HomeRecoEngine` | Structured + semantic + geospatial ranking pattern |
| Real Estate AI Chatbot | `/home/sk/github-repos/real-estate/real-estate-ai-chatbot` | Lead qualification and authorized broker handoff |
| HomeMatch | `/home/sk/github-repos/real-estate/HomeMatch` | Soft lifestyle ranking after hard filters |

Full external repo classification belongs in [`REFERENCES.md`](./REFERENCES.md) and [`REUSE-MATRIX.md`](./REUSE-MATRIX.md).

When adapting code, record the exact local clone commit/tag and license. A local path is convenient evidence; it is not an implementation authority by itself.

## 7 · Docs to create next

Keep this small. Do not create a document just because a topic exists.

| Proposed doc | Create when | Purpose | Priority |
|---|---|---|---|
| `TEST-PLAN.md` | Before SAN-1205 / SAN-483 certification work | One durable J-RE-* test matrix covering browser, API, DB, RLS, failures, and production smoke | **Next** |
| `DATA-BOUNDARIES.md` | While SAN-1104 / SAN-1105 / SAN-1349 are being completed | Canonical ownership/RLS/data visibility contract for renter, broker, admin and AI tools | **Next after ownership work starts** |
| `MIGRATION-PLAN.md` | Only if an actual schema/data cutover is required | Exact source → target data migration, stop/go, rollback and proof | Conditional |
| `OPERATIONS-RUNBOOK.md` | Before production support becomes recurring | What to check when rental search/viewing/broker flow fails in production | Post-MVP / launch |

### Docs we should NOT create now

- `STRATEGY.md` — strategy already lives in the Rentals PRD/Roadmap and MDE Product Roadmap.
- `MVP-PLAN.md` — Linear already owns live MVP sequencing.
- `AGENTS.md` for rentals — agent/platform behavior belongs in shared platform docs unless the rental agent gets a stable domain-specific contract worth documenting.
- separate docs for every external repo — use `REFERENCES.md` + `REUSE-MATRIX.md` instead.

## 8 · Strategy and advanced work

### Current strategy source

Use these instead of creating another strategy document:

1. Rentals & Real Estate PRD + Roadmap:
   https://linear.app/amo100/document/mde-ai-rentals-and-real-estate-prd-roadmap-7881940afa3a
2. MDE Product Roadmap:
   https://linear.app/amo100/document/mde-ai-product-roadmap-888fc22cc000
3. [`RENTALS.md`](./RENTALS.md) for the durable Core/MVP architecture.

### Advanced backlog — explicitly not Core/MVP dependencies

Examples:

- Neighborhood intelligence: https://linear.app/amo100/issue/SAN-1036/mastra-re-013-neighborhood-intelligence-workflow
- Property Intelligence Agent: https://linear.app/amo100/issue/SAN-1318/re-ai-research-001-property-intelligence-agent
- Market intelligence: https://linear.app/amo100/issue/SAN-1317/re-market-001-medellin-rental-market-intelligence
- Saved searches: https://linear.app/amo100/issue/SAN-1077/re-savedsearch-001-saved-searches
- Similar listings: https://linear.app/amo100/issue/SAN-1078/re-recs-001-similar-listings
- Rental booking/payment prep: https://linear.app/amo100/issue/SAN-481/real-014-booking-payment-prep-rental-stripe
- Application wizard: https://linear.app/amo100/issue/SAN-480/real-013-rental-application-wizard

These can become later phases only after the Core/MVP journey is production-proven.

## 9 · Source-of-truth rules

When information conflicts, use this order:

1. Merged MDE `main` implementation.
2. Supabase migrations + verified live read-only evidence.
3. Linear for live task status, ownership, and sequencing.
4. Canonical rental docs for durable product/architecture guidance.
5. Installed package source/types.
6. Official upstream docs/repos/templates.
7. External real-estate OSS as MODEL/REFERENCE unless explicitly verified for stronger reuse.

Real-world example:

> If an old planning doc says viewing creation uses two writes, but current `main` and Supabase show a certified atomic RPC path, the current implementation/database wins. Update the docs; do not rebuild the old design.

## 10 · How to keep this index current

Update this file when one of these changes:

- a canonical rental doc is added/removed;
- a new primary Linear owner replaces an old one;
- a reference repo moves from MODEL → ADAPT/COPY;
- a new local clone becomes an implementation source;
- Core/MVP scope changes;
- a planned document is created.

Do not update this index for every PR status change. Linear owns volatile execution state.

Verification command:

```bash
npm run check:docs
git diff --check
```
