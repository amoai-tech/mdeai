# MDE Rentals / Real Estate Documentation

This folder is the canonical home for current MDE Rentals product, architecture, reuse, and reference documentation.

## Task 1 · Start here

| Document | Use it for |
|---|---|
| [`INDEX.md`](./INDEX.md) | Master table of contents across GitHub docs, Linear plans/tasks, reference repos, local clones, and docs still worth creating |
| [`RENTALS.md`](./RENTALS.md) | What the rental product does, Core/MVP journeys, architecture, blockers, failure behavior, and success criteria |
| [`REUSE-MATRIX.md`](./REUSE-MATRIX.md) | What MDE keeps vs what it adapts/models from external repositories |
| [`REFERENCES.md`](./REFERENCES.md) | Indexed GitHub repos, official examples, templates, and docs used as references |

## Task 2 · Source of truth

When documents disagree, use this order:

1. **Merged MDE `main`** — shipped implementation truth.
2. **Supabase migrations + verified live readback** — database/schema/RLS/function truth.
3. **Linear** — live task status, ownership, priority, and sequencing.
4. **These rental docs** — durable product/architecture/reuse guidance.
5. **External repos/templates** — reference patterns only unless explicitly verified and adapted.

## Task 3 · Core/MVP rule

Keep the rental MVP simple:

```text
search
→ compare
→ map
→ listing
→ viewing request
→ broker follow-up
```

Do not make Core/MVP depend on multi-agent swarms, A2A, MCP, browser agents, deep research, observational memory, schedules, or autonomous broker agents.

## Task 4 · Reference rule

Every external reference must explain:

> **Repo → what we adapt → where it goes in MDE → real-world MDE example → what we do not copy.**

A repo name by itself is not an implementation plan.

## Task 5 · Key planning links

- Master rental reference/planning index: [`INDEX.md`](./INDEX.md)
- MDE repository: https://github.com/amoai-tech/mdeai
- MDE AI project: https://linear.app/amo100/project/mde-ai-bb25cababf6c
- Real Estate Linear view: https://linear.app/amo100/view/real-estate-mde-61c961d1bd58
- MDE Rentals & Real Estate PRD + Roadmap: https://linear.app/amo100/document/mde-ai-rentals-and-real-estate-prd-roadmap-7881940afa3a
- MDE Agent Platform PRD: https://linear.app/amo100/document/mde-agent-platform-prd-2d1bd0e59dbc
- MDE Agent Platform Roadmap: https://linear.app/amo100/document/mde-agent-platform-roadmap-886de8dab1ad
- MDE Reference Reuse Matrix: https://linear.app/amo100/document/mde-reference-reuse-matrix-883571644ed8
- MDE Agent Platform Migration Plan: https://linear.app/amo100/document/mde-agent-platform-migration-plan-5c76cd7d8032

Legacy rental/real-estate docs remain historical evidence until explicitly reviewed, merged, or archived. They do not override this canonical package.
