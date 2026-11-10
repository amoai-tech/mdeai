---
name: poteto-mode
description: Use when the user explicitly asks for poteto-mode or PStack-style outcome-first execution; route MDE bugs, features, investigations, refactors, performance work, and PR tasks to one existing canonical MDE workflow with verifiable outcomes.
---

# Poteto mode — MDE outcome-first adapter

**Job:** turn a concrete goal into a small verified outcome, not another implementation engine. Adapted from [PStack poteto-mode](https://github.com/cursor/plugins/blob/de8ee15dd1194627d21eb5fcd41cb1873208dabb/pstack/skills/poteto-mode/SKILL.md) and its [guide](https://github.com/cursor/plugins/blob/de8ee15dd1194627d21eb5fcd41cb1873208dabb/pstack/docs/guide/02-poteto-mode.md); this is not the Cursor plugin and has no dependency on Cursor's Task API, custom modes, or other PStack skills.

## Ownership and trigger

- Run only when explicitly invoked by name or requested as PStack-style execution. For ordinary tasks, the existing MDE router and owner remain sufficient.
- Choose **one** canonical MDE execution owner; do not start a competing PStack playbook, create another service, or override [AGENTS.md](../../../AGENTS.md).
- On a narrowed task, read the selected owner and only the relevant domain/reference skill. [tasks](../tasks/SKILL.md) owns the PR/worktree lifecycle; [task-verifier](../task-verifier/SKILL.md) owns independent S4 completion proof.
- Preserve Phase A: business approvals, ownership verification, listing eligibility, publication and viewing permissions are not development prerequisites. Preserve authentication, RLS, audit, transactions, truthful data, and payment safety.

## Route by requested outcome

| Goal | Canonical owner | Smallest check |
| --- | --- | --- |
| Unknown bug or regression | [errors](../errors/SKILL.md), then [implement](../implement/SKILL.md) when a fix is requested | Reproduce before and after; regression test |
| Known scoped feature or fix | [implement](../implement/SKILL.md) | Working affected user journey |
| Read-only investigation | [research](../research/SKILL.md) or [architect](../architect/SKILL.md) | Source-backed finding, no edits |
| Architecture or module boundary | [architect](../architect/SKILL.md) | Existing owner, types and callers confirmed |
| Behavior-preserving refactor | [refactor](../refactor/SKILL.md) | Recorded behavior unchanged |
| Performance regression | [errors](../errors/SKILL.md) plus [testing](../testing/SKILL.md) | Same-fixture before/after measurement |
| PR merge readiness | [praudit](../praudit/SKILL.md) | Exact-head checks and proven findings |
| Real browser/API/database outcome | [e2e](../e2e/SKILL.md) | UI/API/DB evidence and cleanup |
| Repeated agent error class | [correct](../correct/SKILL.md) | Failing-before, passing-after guard |

## Execute

1. Restate **goal, expected result, known evidence, and constraints** in plain English. Define a pass/fail done check. Do not ask the owner to repeat facts already in Linear/code.
2. Read the canonical owner; verify current GitHub/Linear/code rather than old summaries. When asked to implement, proceed to the smallest viable change rather than stopping at an audit.
3. Create a short plan only when needed; prefer one verifiable slice. Use an isolated worktree for parallel code changes. Never use parallel agents to write the same branch, process, database row, or browser session.
4. Verify at the narrowest meaningful surface first; then run the applicable release gate. Match UI changes with the real browser, database writes with readback, retries with idempotency checks. A green build alone is not proof.
5. Report **working / broken / changed / blockers / next / proof**. Record exact commands, SHA/environment, and evidence. Mark unrun or inconclusive checks honestly.

## Avoid

- No mandatory swarms, arenas, expensive review panels, model switching, automatic merging, or overnight loops for a small change.
- No new business certification gates during development. Do not change required CI or security policies to get green.
- A generic request for a regular code review or implementation is *not* a poteto-mode invocation.
