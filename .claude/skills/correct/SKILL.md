---
name: correct
description: Use when the user explicitly asks for correct or to prevent the same coding-agent mistake from recurring; trace repeated MDE failure patterns and enforce the smallest durable fix through architecture, types, targeted checks, or regression tests.
---

# Correct — prevent recurring development mistakes

**Job:** stop a proven mistake class from recurring, rather than adding another prompt reminder. Adapted from [PStack correct](https://github.com/cursor/plugins/blob/de8ee15dd1194627d21eb5fcd41cb1873208dabb/pstack/skills/correct/SKILL.md).

## Ownership and scope

- This is a **repeat-pattern** workflow, not generic debugging. For a single unknown bug, use [errors](../errors/SKILL.md); for scoped implementation, use [implement](../implement/SKILL.md).
- Before edits, read [AGENTS.md](../../../AGENTS.md) and use [tasks](../tasks/SKILL.md) for branch/PR steps; code changes belong to the actual canonical owner. Keep skill edits under [writing-skills](../writing-skills/SKILL.md) and [skills](../skills/SKILL.md).
- No unauthorized changes to required CI/release gates, security boundaries, production provider settings, destructive database state, or protected workflows. Preserve prelaunch unrestricted *business* journeys and all technical safeguards.

## Procedure

1. Look at recent PR comments, commits/reverts, failing test output, Linear records, and the actual code. Name a mistake **class** only when the same underlying failure occurred at least twice; cite both occurrences. If evidence is missing, report that and handle only the observed incident.
2. Find the *first* structural cause: duplicate source of truth, wrong ownership boundary, unsafe types, missing check, test that passes on a broken behavior, or a misleading example in the repo.
3. Prefer enforcement in this order:
   - **Architecture:** remove the invalid path or duplicate implementation; keep one supported owner.
   - **Types/schema:** make the invalid state unrepresentable or reject it at the boundary.
   - **Lint/CI/static check:** fail specifically on the mistake, with a clear remediation message.
   - **Behavior test:** assert the actual observable regression, including retries or auth boundaries where applicable.
   - **Agent documentation:** only for judgment calls not enforceable in code. Do not pile up redundant instructions.
4. Choose the smallest relevant enforcement. Before changing the fix, demonstrate a failing reproduction from an actual past mistake when feasible. Then patch the canonical path and show that the same check passes. Avoid sweeping unrelated files.
5. Verify the original user journey and the affected subsystem. If adding a guard would require changing a mandated CI policy, obtain product-owner approval first; do not weaken checks to make a build pass.
6. Do not silently impose business eligibility, ownership verification, photo approvals, publishing or viewing paperwork gates in MDE Phase A. Keep auth, data isolation, audit, atomic operations and idempotency intact.

## Output

For each repeated mistake: **two evidence links → root cause → enforcement level and changed files → failing-before/passing-after check → remaining risk**. If the repetition or new guard was not proven, say so. When requested to correct the pattern, implement the minimal verified enforcement and follow the existing [tasks](../tasks/SKILL.md) commit/PR lifecycle. For an explicitly read-only request, report without modifying code.
