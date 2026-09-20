# MDE Rentals / Real Estate — Reference & Planning Index

One page to find the current Real Estate docs, Linear plans/tasks, reference repos, and the next docs worth creating.

## Table of contents

1. [Start here](#1--start-here)
2. [Product areas and documentation plan](#2--product-areas-and-documentation-plan)
3. [Canonical GitHub docs](#3--canonical-github-docs)
4. [Linear planning and task views](#4--linear-planning-and-task-views)
5. [Core/MVP task map](#5--coremvp-task-map)
6. [Shared platform docs](#6--shared-platform-docs)
7. [Reference repos and local clones](#7--reference-repos-and-local-clones)
8. [Docs to create next](#8--docs-to-create-next)
9. [Strategy and advanced work](#9--strategy-and-advanced-work)
10. [Source-of-truth rules](#10--source-of-truth-rules)
11. [How to keep this index current](#11--how-to-keep-this-index-current)

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

### Summary

| Status | % Complete | Area | Current state | Next |
|---|---:|---|---|---|
| 🟢 | 100% | Core rental docs | Complete | Maintain |
| 🟢 | 100% | Reference index | Complete | Maintain |
| 🟢 | 100% | Reuse matrix | Complete | Maintain |
| 🟢 | 100% | Reference repos | Core/MVP set cloned | Inspect exact commits/licenses before reuse |
| 🔵 | 0% | Test plan | Not started | Create TEST-PLAN.md |
| 🔵 | 0% | Data boundaries | Not started | Create with ownership/RLS work |
| 🔵 | 0% | Migration plan | Not required yet | Create only if a real schema/data cutover appears |
| 🔵 | 0% | Operations runbook | Not started | Create before recurring production support |
| 🟡 | 70% | Core/MVP implementation | In progress | Finish rental journey blockers in Linear |
| 🔵 | 0% | Advanced real-estate features | Deferred | Start only after Core/MVP production proof |

**Legend:** 🟢 Complete · 🟡 In progress · 🔴 Blocked/failed · 🔵 Not started

This is a summary only. Linear remains the live source for implementation task status.


## 2 · Product areas and documentation plan

Use the task numbers as the durable execution order. Whole numbers (`1.0`, `2.0`, `3.0`) are product areas; decimals (`1.1`, `1.2`, `1.3`) leave room for additional tasks without renumbering later.

| Task | Status | % Complete | Product area | Planned doc | Next |
|---:|---|---:|---|---|---|
| **1.0** | 🟢 | 100% | Rental Experience | [`RENTALS.md`](./RENTALS.md) | Maintain Core/MVP scope |
| 1.1 | 🟢 | 100% | Reference index | [`INDEX.md`](./INDEX.md) | Maintain |
| 1.2 | 🟢 | 100% | Reuse decisions | [`REUSE-MATRIX.md`](./REUSE-MATRIX.md) | Maintain |
| 1.3 | 🟢 | 100% | External references | [`REFERENCES.md`](./REFERENCES.md) | Maintain |
| **2.0** | 🔵 | 0% | Testing the Rental Journey | `TEST-PLAN.md` | **Create next** |
| 2.1 | 🔵 | 0% | Core Rental Journey Tests | `TEST-PLAN.md` | Map J-RE-* journeys |
| 2.2 | 🔵 | 0% | Database & Permission Tests | `TEST-PLAN.md` | Add deterministic backend proof |
| 2.3 | 🔵 | 0% | Browser & Production Tests | `TEST-PLAN.md` | Add Playwright + production smoke |
| **3.0** | 🔵 | 0% | Accounts & Permissions | `DATA-BOUNDARIES.md` | Create with ownership/RLS work |
| 3.1 | 🔵 | 0% | Property Ownership | `DATA-BOUNDARIES.md` | Define authoritative ownership |
| 3.2 | 🔵 | 0% | Who Can See What | `DATA-BOUNDARIES.md` | Define renter/broker/admin isolation |
| 3.3 | 🔵 | 0% | AI Access to Rental Data | `DATA-BOUNDARIES.md` | Define tool/agent visibility |
| **4.0** | 🔵 | 0% | Finding a Home | `SEARCH.md` | Create after testing + data boundaries |
| 4.1 | 🔵 | 0% | Search by Requirements | `SEARCH.md` | Document SQL hard filters |
| 4.2 | 🔵 | 0% | Best Match Ranking | `SEARCH.md` | Document semantic ranking after eligibility |
| 4.3 | 🔵 | 0% | Move-in Dates & Availability | `SEARCH.md` | Document date/availability rules |
| **5.0** | 🔵 | 0% | Book a Viewing | `VIEWINGS-LEADS.md` | Define committed conversion path |
| 5.1 | 🔵 | 0% | Confirm a Viewing | `VIEWINGS-LEADS.md` | Define user approval + truthful UI |
| 5.2 | 🔵 | 0% | Save the Viewing Request | `VIEWINGS-LEADS.md` | Define lead/showing transaction |
| 5.3 | 🔵 | 0% | Send to Broker & Track Follow-Up | `VIEWINGS-LEADS.md` | Define states + broker handoff |
| **6.0** | 🔵 | 0% | Broker Dashboard | `BROKER-WORKSPACE.md` | Define broker workflow |
| 6.1 | 🔵 | 0% | Broker Sees Their Rentals & Leads | `BROKER-WORKSPACE.md` | Define authorized views |
| 6.2 | 🔵 | 0% | Broker Follow-Up | `BROKER-WORKSPACE.md` | Define lead/showing actions |
| **7.0** | 🔵 | 0% | Property Listings | `LISTINGS.md` | Define listing truth contract |
| 7.1 | 🔵 | 0% | Listing Quality | `LISTINGS.md` | Define required listing fields/quality |
| 7.2 | 🔵 | 0% | Property Details | `LISTINGS.md` | Define detail-view contract |
| **8.0** | 🔵 | 0% | Map & Neighborhood | `MAPS.md` | Define map/card contract |
| 8.1 | 🔵 | 0% | Listing Card ↔ Map Pin | `MAPS.md` | Document shared listing identity |
| 8.2 | 🔵 | 0% | Map Area & Location | `MAPS.md` | Document bounds/PostGIS behavior |
| **9.0** | 🔵 | 0% | Production Support | `OPERATIONS-RUNBOOK.md` | Create before launch/support |
| 9.1 | 🔵 | 0% | Find Production Problems | `OPERATIONS-RUNBOOK.md` | Document common failure paths |
| 9.2 | 🔵 | 0% | Recover Safely | `OPERATIONS-RUNBOOK.md` | Document safe recovery checks |
| **10.0** | 🔵 | 0% | Data Migration | `MIGRATION-PLAN.md` | Create only if required |
| **11.0** | 🔵 | 0% | Future Smart Features | Deferred | Start after Core/MVP proof |
| **12.0** | 🟢 | 100% | AI Platform | Shared platform docs | Keep platform-owned; no rental duplicate |

Add future work as the next decimal inside the relevant area—for example `5.4`—instead of renumbering later sections.

## 3 · Canonical GitHub docs

| Status | % Complete | Document | Purpose | Next |
|---|---:|---|---|---|
| 🟢 | 100% | [`INDEX.md`](./INDEX.md) | Navigation across docs, Linear, tasks, and references | Maintain |
| 🟢 | 100% | [`README.md`](./README.md) | Small folder router and source-of-truth rules | Maintain |
| 🟢 | 100% | [`RENTALS.md`](./RENTALS.md) | Product, journeys, architecture, blockers, success criteria | Maintain as architecture changes |
| 🟢 | 100% | [`REUSE-MATRIX.md`](./REUSE-MATRIX.md) | KEEP / COPY / ADAPT / MODEL / REFERENCE / SKIP decisions | Pin exact commit/license before direct reuse |
| 🟢 | 100% | [`REFERENCES.md`](./REFERENCES.md) | GitHub repos, official templates, local clones, and MDE adaptations | Keep sources and local paths current |

GitHub docs root:
https://github.com/amoai-tech/mdeai/tree/main/docs

Rentals folder on `main` after merge:
https://github.com/amoai-tech/mdeai/tree/main/docs/04-domains/rentals

## 4 · Linear planning and task views

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

## 5 · Core/MVP task map

Use Linear for live status. These percentages are a simple planning snapshot for this index; update them when the underlying Linear task meaningfully changes.

| Status | % Complete | Area | Primary Linear task | What becomes true |
|---|---:|---|---|---|
| 🟡 | 70% | Rental launch coordinator | [SAN-1315](https://linear.app/amo100/issue/SAN-1315/san-1315-finish-the-rental-journey-from-apartment-discovery-to) | Discovery → detail → committed viewing works as one journey |
| 🟡 | 70% | Rental readiness tracker | [SAN-1270](https://linear.app/amo100/issue/SAN-1270/san-1270-keep-the-rental-production-readiness-tracker-current) | One current rental readiness view |
| 🟡 | 70% | Viewing UI truth | [SAN-1203](https://linear.app/amo100/issue/SAN-1203/san-1203-make-a-viewing-request-count-only-after-the-database-commits) | UI confirms only after the DB commits |
| 🟡 | 70% | Atomic viewing write | [SAN-1286](https://linear.app/amo100/issue/SAN-1286/san-1286-make-rental-viewing-requests-one-atomic-database-write) | One atomic lead + showing write path |
| 🟡 | 70% | Lead capture proof | [SAN-474](https://linear.app/amo100/issue/SAN-474/san-474-re-007-prove-rental-lead-capture-through-the-real-edge-atomic) | Real edge/API path reaches the atomic write |
| 🟡 | 70% | Broker Sees Their Rentals & Leads | [SAN-476](https://linear.app/amo100/issue/SAN-476/real-009-prove-committed-showing-authorized-broker-visibility) | Correct broker sees committed showing |
| 🟡 | 70% | Host workspace | [SAN-1204](https://linear.app/amo100/issue/SAN-1204/re-des-009-host-workspace-surfaces-real-consumer-leads-viewings) | Real leads/viewings appear in host UI |
| 🟡 | 70% | End-to-end rental journey | [SAN-1205](https://linear.app/amo100/issue/SAN-1205/re-wire-004-prove-the-complete-rental-conversion-journey-end-to-end) | Full browser journey is proven |
| 🔵 | 0% | Production smoke | [SAN-483](https://linear.app/amo100/issue/SAN-483/real-016-final-production-rental-conversion-smoke-floor) | Production rental conversion stays green |
| 🟡 | 70% | Rental ownership model | [SAN-1104](https://linear.app/amo100/issue/SAN-1104/d-01-ptr-rentals-001-landlord-id-ownership-model) | Every rental has authoritative owner identity |
| 🟡 | 70% | Broker isolation | [SAN-1105](https://linear.app/amo100/issue/SAN-1105/d-02-ptr-rentals-002-broker-rls-two-user-test) | Broker A cannot read Broker B data |
| 🟡 | 70% | Production data boundary | [SAN-1349](https://linear.app/amo100/issue/SAN-1349/supa-re-015-close-rental-production-data-boundary-gaps) | Ownership/RLS/data gaps are closed |
| 🟡 | 70% | Rental test harness | [SAN-482](https://linear.app/amo100/issue/SAN-482/san-482-shared-rental-test-harness-fixtures-auth-states-and-rls-proof) | Repeatable renter/broker/RLS fixtures exist |
| 🟡 | 70% | Cards ↔ map sync | [SAN-472](https://linear.app/amo100/issue/SAN-472/san-472-re-005-map-pin-sync-with-rental-cards) | Cards and pins select the same listing |
| 🟡 | 70% | Listing Quality | [SAN-468](https://linear.app/amo100/issue/SAN-468/real-002-apartment-inventory-quality) | Core listings are trustworthy enough for MVP |
| 🟡 | 70% | Move-in Dates & Availability | [SAN-486](https://linear.app/amo100/issue/SAN-486/real-019-rental-search-availability-date-filters) | Dates are deterministic search constraints |
| 🟡 | 70% | AI/data isolation | [SAN-547](https://linear.app/amo100/issue/SAN-547/san-547-keep-each-users-ai-tools-and-supabase-data-isolated) | User/thread/tool data stays isolated |
| 🟡 | 70% | AI safety | [SAN-1054](https://linear.app/amo100/issue/SAN-1054/san-1054-prove-rental-ai-cannot-leak-prompts-data-or-perform) | Rental AI cannot leak or perform unauthorized actions |

## 6 · Shared platform docs

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

## 7 · Reference repos and local clones

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

| Status | % Complete | Repo | Local path | Main MDE use |
|---|---:|---|---|---|
| 🟢 | 100% | Dubai Real Estate | `/home/sk/github-repos/real-estate/dubai-real-estate` | SQL-first hard truth before AI ranking |
| 🟢 | 100% | HomeRecoEngine | `/home/sk/github-repos/real-estate/HomeRecoEngine` | Structured + semantic + geospatial ranking pattern |
| 🟢 | 100% | Real Estate AI Chatbot | `/home/sk/github-repos/real-estate/real-estate-ai-chatbot` | Lead qualification and authorized broker handoff |
| 🟢 | 100% | HomeMatch | `/home/sk/github-repos/real-estate/HomeMatch` | Soft lifestyle ranking after hard filters |

Full external repo classification belongs in [`REFERENCES.md`](./REFERENCES.md) and [`REUSE-MATRIX.md`](./REUSE-MATRIX.md).

When adapting code, record the exact local clone commit/tag and license. A local path is convenient evidence; it is not an implementation authority by itself.

## 8 · Docs to create next

Keep this small. Do not create a document just because a topic exists.

| Status | % Complete | Proposed doc | Product area | Create when | Purpose | Priority |
|---|---:|---|---|---|---|---|
| 🔵 | 0% | `TEST-PLAN.md` | Testing the Rental Journey | Before SAN-1205 / SAN-483 certification work | J-RE-* matrix across unit, API, DB, RLS, Playwright, failure, and production smoke | **1 · Next** |
| 🔵 | 0% | `DATA-BOUNDARIES.md` | Accounts & Permissions | With SAN-1104 / SAN-1105 / SAN-1349 | Canonical renter/broker/admin/AI visibility and ownership contract | **2** |
| 🔵 | 0% | `SEARCH.md` | Finding a Home | When SAN-486/search hardening is active | SQL eligibility, filters, ranking, availability/date rules, degraded search behavior | **3** |
| 🔵 | 0% | `VIEWINGS-LEADS.md` | Book a Viewing | With SAN-1203 / SAN-1286 / SAN-474 | Approval, atomic lead/showing write, truthful confirmation, lifecycle | **4** |
| 🔵 | 0% | `BROKER-WORKSPACE.md` | Broker Dashboard | With SAN-476 / SAN-1204 | Broker listings, leads, viewings, and follow-up | **5** |
| 🔵 | 0% | `LISTINGS.md` | Property Listings | When inventory/detail work needs a stable contract | Listing schema/contract, detail view, inventory quality, canonical truth | **6** |
| 🔵 | 0% | `MAPS.md` | Map & Neighborhood | When map/search interaction changes | Listing cards, map pins, bounds, selection, and location behavior | **7** |
| 🔵 | 0% | `OPERATIONS-RUNBOOK.md` | Production Support | Before recurring production support | Diagnosis, degraded modes, recovery, support checks | **8 · Launch** |
| 🔵 | 0% | `MIGRATION-PLAN.md` | Data Migration | Only if a real schema/data cutover is required | Exact source → target migration, stop/go, rollback, proof | Conditional |

### Docs we should NOT create now

- `STRATEGY.md` — strategy already lives in the Rentals PRD/Roadmap and MDE Product Roadmap.
- `MVP-PLAN.md` — Linear already owns live MVP sequencing.
- `AGENTS.md` for rentals — agent/platform behavior belongs in shared platform docs unless the rental agent gets a stable domain-specific contract worth documenting.
- separate docs for every external repo — use `REFERENCES.md` + `REUSE-MATRIX.md` instead.

## 9 · Strategy and advanced work

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

## 10 · Source-of-truth rules

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

## 11 · How to keep this index current

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
