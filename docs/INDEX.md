# MDE AI — Documentation Index

Updated: 2026-09-15

Repository: https://github.com/amoai-tech/mdeai  
Production: https://www.mdeai.co/  
Linear project: https://linear.app/amo100/project/mde-ai-bb25cababf6c  
Cleanup task: https://linear.app/amo100/issue/SAN-1271/mde-docs-001-canonical-docs-index-stale-documentation-cleanup

## Source-of-truth rules

Use these in this order when documentation disagrees:

1. **Code + tests + migrations** — implementation truth.
2. **`src/app`** — route truth for pages and Next.js route handlers.
3. **Linear — MDE AI** — live task status, priority, ownership, and execution order.
4. **Current canonical docs** — architecture, product intent, design rules, and operating guidance.
5. **Historical docs** — useful context only; never use old status percentages, SHAs, or task queues as current truth.

## Start here

| Need | Canonical source |
|---|---|
| Product/repo overview | [`README.md`](../README.md) |
| Current page + API route inventory | [`sitemap.md`](../sitemap.md) |
| Architecture | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) |
| Product requirements | [`prd.md`](../prd.md) + [`plan/prd/`](../plan/prd/) |
| Design rules | [`DESIGN.MD`](../DESIGN.MD) |
| AI/development instructions | [`AGENTS.md`](../AGENTS.md), [`CLAUDE.md`](../CLAUDE.md) |
| Skills | [`index-skills.md`](../index-skills.md) |
| Change history | [`changelog.md`](../changelog.md) |
| Live work/status | [Linear — MDE AI](https://linear.app/amo100/project/mde-ai-bb25cababf6c) |

## Canonical/current docs — KEEP

These remain active reference documents. Their implementation claims must still defer to code and Linear.

| File | Purpose |
|---|---|
| `README.md` | Repository entry point and local development basics |
| `docs/INDEX.md` | Canonical documentation navigation and lifecycle rules |
| `docs/ARCHITECTURE.md` | Current architecture overview |
| `sitemap.md` | Generated inventory of current `src/app` routes |
| `AGENTS.md` | Agent/development instructions |
| `CLAUDE.md` | Repository development instructions |
| `DESIGN.MD` | UI/design system guidance |
| `LESSONS.md` | Durable engineering lessons |
| `index-skills.md` | Skill index |
| `changelog.md` | Change history |
| `advanced.md` | Advanced/post-MVP product context; reconcile scope with Linear `MDE_ADV` when editing |

## Useful but stale — UPDATE

Keep the durable architecture/product content, but refresh status, links, paths, and implementation claims before treating these as current.

| File | Required update |
|---|---|
| `prd.md` | Keep product/architecture intent; remove stale May 2026 implementation status and old local-path assumptions |
| `roadmap.md` | Preserve strategy, but replace old SHAs/readiness snapshots and point execution status to Linear |
| `dashboard.md` | Rebuild from current GitHub + Linear; old June 2026 route/completion claims are stale |
| `todo.md` | Convert to a pointer/summary; Linear must own live task status and ordering |
| `docs/index-docs.md` | Supersede with this `docs/INDEX.md`, then archive or reduce to a pointer |

## Historical execution snapshots — ARCHIVE

These contain useful history but should not compete with Linear or current code. Move them to a clearly historical location in a separate cleanup PR after reference checks.

| File | Reason |
|---|---|
| `tasks.md` | Hard-coded June 2026 task ordering and completion state |
| `plan.md` | Old Discovery Beta / Commerce sequencing and old readiness snapshot |
| `linear.md` | Legacy Linear workflow/process |
| `index.md` | Old platform/repo index and implementation state |

Recommended archive location:

```text
docs/_archive/root-snapshots/
```

## Remove only after proof — REMOVE

Do not delete architecture, audits, acceptance evidence, migrations, or decision history merely because it is old.

Candidates for removal must first be proven unreferenced and non-durable:

- editor/local workspace artifacts such as accidental `.obsidian/` content
- `*.bak` and timestamped duplicate backups
- accidental `Untitled.md` files
- reproducible generated logs/reports that are already stored by CI
- local runtime database artifacts such as `*.db-shm` / `*.db-wal` when they are not fixtures
- exact duplicate documents after the canonical copy is confirmed

## Documentation lifecycle

When changing the product:

1. Change and test the implementation.
2. Update Linear for live task state.
3. If a Next.js page or route handler changed, regenerate `sitemap.md` from `src/app`.
4. Update the relevant canonical architecture/product doc.
5. Archive superseded status snapshots instead of silently deleting useful history.
6. Check internal links after moves or renames.

## Route documentation rule

`sitemap.md` documents **what exists in `src/app` now**. It must not mix planned URLs into the live route inventory.

Planned work belongs in Linear:

- `MVP_MDE` — launch/MVP work
- `MDE_ADV` — post-MVP/advanced work

This prevents a planned page from being mistaken for an implemented Next.js route.

## Documentation cleanup tracker

All cleanup from this index is tracked under:

**SAN-1271 · MDE-DOCS-001 — Canonical docs index + stale documentation cleanup**  
https://linear.app/amo100/issue/SAN-1271/mde-docs-001-canonical-docs-index-stale-documentation-cleanup
