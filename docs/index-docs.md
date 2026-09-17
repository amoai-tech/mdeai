---
title: MDE AI documentation index
updated: 2026-09-16
status: transitional index — Task 45 audit in progress
source_of_truth: Linear for live work; merged main for shipped code; src/app for implemented routes
---

# MDE AI documentation index

This file is the **current navigation index for the documentation that exists on `main`**.

It is intentionally transitional. The repository still contains older June 2026 planning, task, audit, and architecture material that must be classified before the final `docs/INDEX.md` is created.

## Source-of-truth rules

1. **Linear MDE AI** owns live task status, priority, and execution order.
2. **Merged `main`** owns shipped repository truth.
3. **`src/app`** owns implemented route truth.
4. **Code, migrations, package manifests, and tests** own implementation truth.
5. Documentation explains the product and architecture; it must not override current code or Linear.
6. Historical audits, evidence, and decisions should be archived rather than silently rewritten as current truth.

## Start here

| Need | Current location | Status |
|---|---|---|
| Repository documentation overview | [`README.md`](README.md) | Review/update |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) | Review/rewrite into canonical architecture docs |
| Local QA | [`localhost-qa-runbook.md`](localhost-qa-runbook.md) | Review against current scripts/runtime |
| Design system and UX | [`design/`](design/) | Active area; audit required |
| Testing and evidence | [`testing/`](testing/) and [`tasks/testing/`](tasks/testing/) | Preserve; separate current guidance from historical evidence |
| Product/task history | [`tasks/`](tasks/) | Historical/reference-heavy; Linear owns live execution |

## Current top-level documentation areas

| Area | Current location | Task 45 disposition |
|---|---|---|
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) | UPDATE / MERGE |
| AI / agent architecture | [`intelligence/`](intelligence/), [`copilotkit-mastra/`](copilotkit-mastra/), [`ai-second-brain/`](ai-second-brain/) | AUDIT / MERGE into platform docs where current |
| Events | [`events/`](events/), [`tasks/events/`](tasks/events/) | AUDIT / MERGE; separate current domain docs from task history |
| Venues | [`tasks/venues/`](tasks/venues/) | AUDIT / MERGE; extract current venue domain truth from task-heavy material |
| Nightlife | [`tasks/venues/`](tasks/venues/) | AUDIT / REWRITE; separate nightlife discovery/booking truth from shared venue task history |
| Real estate / rentals | [`real-estate/`](real-estate/) | AUDIT / REWRITE |
| Restaurants | [`restaurant/`](restaurant/) | AUDIT / REWRITE |
| Partners / sponsors | [`partners/`](partners/) | AUDIT / REWRITE; protect active PR work |
| Ecommerce | [`ecommerce/`](ecommerce/) | AUDIT; keep only current product direction |
| Design / wireframes | [`design/`](design/), [`wireframes/`](wireframes/) | KEEP / REVIEW; archive superseded handoffs |
| Platform / infrastructure | [`security/`](security/) | AUDIT / REWRITE; shared platform material also exists across task/domain docs and must be consolidated |
| Product / PRD material | [`prd/`](prd/) | AUDIT / MERGE into canonical product docs |
| Strategy / research | [`strategy/`](strategy/), [`research/`](research/), [`revenue-strategy.md`](revenue-strategy.md), [`revenue-strategy-v2.md`](revenue-strategy-v2.md), [`strategic-audit.md`](strategic-audit.md) | REVIEW; current strategy separate from historical research |
| Testing / QA | [`testing/`](testing/), [`localhost-qa-runbook.md`](localhost-qa-runbook.md) | KEEP / UPDATE |
| Linear/task exports | [`linear/`](linear/), [`tasks/`](tasks/), [`task-backlog.md`](task-backlog.md) | ARCHIVE / POINTER; must not compete with Linear |
| Audits | [`audits/`](audits/) | PRESERVE; label current vs historical |
| Session/reference notes | [`notes/`](notes/), [`graphify-reference.md`](graphify-reference.md) | REVIEW / ARCHIVE where obsolete |
| Upgrade notes | [`upgradeV2/`](upgradeV2/) | REVIEW; archive if migration is complete |

## Root docs inside `docs/`

| File | Current action |
|---|---|
| [`README.md`](README.md) | UPDATE |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | REWRITE / MERGE into `docs/architecture/` |
| [`dashboard.md`](dashboard.md) | REBUILD from current code + Linear |
| [`index-docs.md`](index-docs.md) | CURRENT transitional index; supersede later with `docs/INDEX.md` |
| [`localhost-qa-runbook.md`](localhost-qa-runbook.md) | REVIEW / UPDATE |
| [`task-backlog.md`](task-backlog.md) | ARCHIVE / replace with Linear pointer |
| [`todo.md`](todo.md) | ARCHIVE / replace with Linear pointer |
| [`changelog.md`](changelog.md) | KEEP as history; verify maintenance model |
| [`strategic-audit.md`](strategic-audit.md) | REVIEW / snapshot-label |
| [`revenue-strategy.md`](revenue-strategy.md) | REVIEW |
| [`revenue-strategy-v2.md`](revenue-strategy-v2.md) | REVIEW / MERGE with current strategy |
| [`graphify-reference.md`](graphify-reference.md) | REVIEW |

## Target documentation architecture

Task 44 defined the target structure below. **Do not bulk-move files into it until Task 45 finishes the audit.**

```text
docs/
├── INDEX.md
├── architecture/
├── product/
├── platform/
├── domains/
├── design/
├── strategy/
├── testing/
└── _archive/
```

### Intended ownership

- `architecture/` — system architecture, boundaries, durable decisions and lessons.
- `product/` — current product definition and PRD-level intent; no live task queue.
- `platform/` — shared CopilotKit, Mastra, Supabase, Gemini, Maps, Next.js, Stripe, Cloudinary and infrastructure guidance.
- `domains/` — events, real estate/rentals, venues, restaurants/cafes/nightlife, trips, partners/sponsors, ecommerce where current.
- `design/` — current design system, UX patterns and useful wireframes.
- `strategy/` — current market/business/revenue strategy and selected research.
- `testing/` — current QA, release, test and verification guidance.
- `_archive/` — superseded plans, task exports, audits, snapshots and historical evidence.

## Current audit rules

During Task 45, classify important documents as:

- **CURRENT** — accurate and canonical today.
- **UPDATE** — useful structure/content but stale facts.
- **MERGE** — useful content duplicated across multiple files.
- **ARCHIVE** — historical or superseded, still worth preserving.
- **REMOVE-CANDIDATE** — generated, temporary, empty or exact duplicate; delete only after proof.
- **UNKNOWN-PRESERVE** — unclear ownership or value; keep until resolved.

## Known stale patterns to remove from active docs

Active documentation should not keep these as current truth:

- old repository references such as `amo-tech-ai/mdeapp`;
- assumptions that `/home/sk/mdeai/mdeapp` is the repository root;
- retired skill names such as `mde-real-estate` and `mde-maps` once the canonical skill stack is merged;
- hard-coded task status/order that duplicates Linear;
- stale commit SHAs or readiness percentages presented as evergreen facts;
- route claims that conflict with current `src/app`.

Historical files under the future `_archive/` may preserve old names and paths when clearly labelled as historical.

## Documentation work sequence

```text
Task 44 · Define Documentation Architecture            ✅ Done
Task 45 · Audit Docs Against Current Code              ← current
Task 46 · Rewrite Core MDE Documentation
Task 47 · Rewrite Domain Documentation
Task 48 · Consolidate and Archive Legacy Docs
Task 49 · Add Documentation Drift Prevention
```

Linear project: https://linear.app/amo100/project/mde-ai-bb25cababf6c/issues

Repository: https://github.com/amoai-tech/mdeai

Production: https://www.mdeai.co/
