---
name: writing-skills
description: >-
  Use when creating, editing, consolidating, evaluating, benchmarking, or testing Claude skills, especially when triggering, overlap, context size, references, or reliability need improvement.
---

# Writing Skills

## Purpose

Create skills that trigger at the right time, load only the context they need, teach reusable judgment, and can be verified instead of merely sounding good.

## Shared MDE standards

Before creating or materially changing a skill, read:

- [`../tasks/references/shared/skill-authoring-standard.md`](../tasks/references/shared/skill-authoring-standard.md) for discovery metadata, progressive disclosure, trust boundaries, and eval discipline.
- [`../tasks/references/shared/prompting-standard.md`](../tasks/references/shared/prompting-standard.md) for prompt structure and quality gates.
- [`../tasks/references/shared/outcome-rubric-standard.md`](../tasks/references/shared/outcome-rubric-standard.md) when the skill drives substantial S2-S4 work or completion grading.
- [`../tasks/references/shared/subagent-standard.md`](../tasks/references/shared/subagent-standard.md) when the skill will be preloaded into or used by a project subagent.

Do not duplicate these standards inside individual skills. A skill should add only its own trigger, ownership, invariants, decisions, procedures, references, and evals.

## Authoring contract

1. **Capture intent first.** State the job, trigger conditions, expected output, dependencies, and success criteria.
2. **Check for overlap.** Prefer improving an existing canonical skill over creating a second skill that owns the same workflow.
3. **Use progressive disclosure.** Keep the main `SKILL.md` concise; move heavy reference material to `references/`, deterministic helpers to `scripts/`, and reusable output assets to `assets/`.
4. **Optimize discovery.** `name` uses lowercase letters/numbers/hyphens. `description` starts with `Use when`, contains trigger conditions only, and never summarizes the skill workflow.
5. **Write imperative instructions.** Explain why important constraints exist; avoid repetitive MUST-heavy prose when a short rationale is clearer.
6. **Use repository truth.** Project-specific rules belong in the project skill or project instructions, not copied into generic skills.
7. **Add examples only when they reduce ambiguity.** Examples should teach the invariant, not accidentally narrow the skill to one project.
8. **Test the skill.** Separate trigger evals from behavior evals. For material, objectively verifiable, or routing-sensitive changes, compare the candidate skill against a no-skill or previous-skill baseline before declaring improvement.
9. **Treat repo skills as trusted code.** `.claude/skills/` is part of the agent trust boundary: review skill changes like executable instructions, avoid unreviewed external content, and keep branch-local skills versioned with the code they describe.
10. **Control context cost.** Skill metadata is always discoverable and loaded skill bodies persist in context; keep `SKILL.md` concise and move deep detail to references/scripts loaded only when needed.
11. **Refactor after evidence.** Remove redundant text, close discovered loopholes, and re-run the relevant evals.

## MDE skill structure

```text
skill-name/
├── SKILL.md
├── references/   # optional; loaded only when needed
├── scripts/      # optional deterministic helpers
├── assets/       # optional output templates/assets
└── evals/        # MDE test prompts/expectations
```

## Quality gate

Before considering a skill ready:
- Frontmatter has a lowercase kebab-case `name` and a concise `description` that starts with `Use when` and contains trigger conditions only.
- Main file is preferably <500 lines and has no duplicated reference dump.
- Relative links resolve.
- No stale project/repo paths or copied domain terminology remain.
- Ownership vs neighboring skills is explicit.
- Instructions do not contradict `tasks`, `task-verifier`, or the owning domain skill.
- At least two realistic eval prompts exist when behavior is objectively testable; important material rewrites include baseline-vs-candidate evidence.
- Mechanical rules that can be linted are automated rather than repeated as prose.

## References

- [`references/anthropic-best-practices.md`](references/anthropic-best-practices.md) — official-style authoring guidance mirrored from the Superpowers source pack.
- [`references/testing-skills-with-subagents.md`](references/testing-skills-with-subagents.md) — pressure-test approach.
- [`references/persuasion-principles.md`](references/persuasion-principles.md) — when compliance depends on explaining why.

For current Anthropic guidance, verify against the official `skill-creator` source before materially changing this standard.
