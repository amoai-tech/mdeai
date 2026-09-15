---
name: domain-modeling
description: >-
  Use when MDE terminology, entities, states, ownership, invariants, or boundaries are ambiguous, duplicated, or inconsistent across code, database, UI, agents, or product docs.
---

# Domain Modeling

## Purpose

Sharpen the shared language and invariants of MDE so code, data, UI, agents, tasks, and documentation mean the same thing.

## Workflow

1. Identify the ambiguous term, entity, state, or ownership boundary.
2. Collect current meanings from code, schema, live behavior, Linear, and canonical docs.
3. Write concrete scenarios, including edge cases that expose competing interpretations.
4. Choose one canonical term/model only when the evidence supports it.
5. Record definitions, invariants, lifecycle/state transitions, ownership, and disallowed states.
6. Update affected code/docs/tasks or create a bounded follow-up when renaming/migration is too large.
7. Record a durable architectural decision when the choice has meaningful long-term tradeoffs.

## MDE examples

Model explicitly when terms can drift, such as:
- event vs venue vs event booking vs venue proposal;
- reservation vs booking request vs confirmed booking;
- rental lead vs viewing request vs application;
- host vs partner vs venue owner;
- draft/proposed/approved/published/cancelled states;
- user/session/thread/run ownership across CopilotKit, Mastra, and Supabase.

## Source-of-truth order

Runtime/schema/code outrank stale prose. Linear describes current task intent. Canonical docs explain accepted domain/architecture decisions. Historical docs and external reference repos are evidence, not authority.

## Output

Prefer the existing project convention. For MDE, durable outputs should normally live under `docs/architecture/` or the owning `docs/domains/<domain>/` folder. Use an ADR when the decision changes architecture or creates a long-lived constraint.

A useful domain record contains: glossary, entities, ownership, invariants, lifecycle/state diagram when helpful, examples/non-examples, and unresolved questions.

## References

- [`references/CONTEXT-FORMAT.md`](references/CONTEXT-FORMAT.md) — source pattern for a domain context document; adapt path/naming to MDE rather than creating `CONTEXT.md` automatically.
- [`references/ADR-FORMAT.md`](references/ADR-FORMAT.md) — ADR pattern.
