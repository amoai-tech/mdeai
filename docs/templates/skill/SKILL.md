---
name: example-skill
description: >-
  Use when a concrete set of trigger conditions for this skill applies.
disable-model-invocation: true
---

# Example skill template

> Copy this folder to `.claude/skills/<skill-name>/`. Before using the copy, remove `disable-model-invocation: true` unless the skill is intentionally model-disabled. Keep the active `SKILL.md` concise and move deep material to `references/`.

## Ownership

State the exact responsibility this skill owns and the neighboring concerns it does not own.

## Source priority

1. Current runtime/repository evidence.
2. Version-matched official source or docs.
3. MDE-specific invariants.
4. Historical/reference material.

## When to use

List concrete symptoms, intents, technologies, and situations that make this skill relevant.
Keep workflow instructions out of the frontmatter description.

## Boundaries

Explain important exclusions and route them to the correct neighboring skill when useful.
## Decision rules

Put the reusable judgment here. Use imperative instructions and explain why important constraints exist.
Keep volatile API details out of the main skill when they can be looked up or isolated in references.

## Workflow

1. Inspect the current state before changing anything.
2. Load only the reference needed for the current variant/problem.
3. Make the smallest safe change consistent with the owning contract.
4. Verify the affected behavior with objective evidence.
5. Hand off to independent review/verification when risk requires it.

## References

- `references/<topic>.md` — explain exactly when to read it.
- `scripts/<helper>` — use for deterministic/repetitive checks.
- `assets/<asset>` — use only when producing the related output.

## Evaluation

Keep trigger evals separate from behavior evals.
For material rewrites, compare the candidate against a no-skill or previous-skill baseline when the behavior is objectively testable.