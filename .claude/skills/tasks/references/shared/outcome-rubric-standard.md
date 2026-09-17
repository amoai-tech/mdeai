# MDE outcome and rubric standard

Use this for substantial S2-S4 development work and any task whose completion must be independently certified. This adapts Anthropic Managed Agents Outcomes to the MDE development lifecycle; it does not require MDE to use the Managed Agents API.

## Outcome contract

Every substantial task defines one observable end result. The outcome describes **what must be true**, not the implementation steps.

Required fields:

- **Outcome:** one observable user/system result.
- **Rubric:** explicit independently gradeable criteria; never omit this for S2-S4.
- **Evidence source:** exact test, command, runtime observation, database proof, or artifact for each criterion.
- **Constraints:** safety, scope, ownership, and systems that must not change.
- **Iteration limit:** a bounded revision loop appropriate to cost/risk.
- **STOP conditions:** contradictions, impossible criteria, missing permissions/dependencies, or unsafe paths.

## Rubric rules

Prefer objective criteria such as:

- `npm run typecheck` exits 0.
- cross-tenant RLS deny case is rejected.
- duplicate webhook replay creates one durable write.
- a named Playwright journey passes at the target viewport.

Avoid criteria such as “looks good”, “works properly”, or “production ready” unless decomposed into measurable evidence. Score criteria independently so one strong area cannot hide a failed blocker.

For S3/S4, implementation and final grading must use separate contexts. Review/grader feedback returns to `tasks` for a bounded revision loop. If the outcome and rubric contradict each other, stop and repair the task contract rather than coding around it.

## Goals vs outcomes

- **Outcome** = durable task-level definition of success and grading rubric.
- **Managed Agents Outcome** = platform grade-and-revise loop with a required rubric and separate-context grader. Only one outcome is active at a time; new outcomes should be sequenced after a terminal result.
- **`/goal`** = optional Claude Code session-level persistence for long-running execution toward an already-defined outcome. One goal is active per session.
- `/goal` does not change permissions and its evaluator judges only evidence surfaced in the conversation; it does not independently run commands or inspect files.
- `/goal` never replaces Linear scope, the rubric, permissions, STOP conditions, or independent verification.

## MDE iteration policy

Use the smallest useful bounded loop. Each revision must respond to explicit failed rubric criteria. Stop early when satisfied; stop and report when blocked, contradictory, impossible, or unsafe. Do not burn iterations merely to improve style after all required criteria pass.

## Primary references

- https://platform.claude.com/docs/en/managed-agents/define-outcomes
- https://code.claude.com/docs/en/goal
- https://platform.claude.com/cookbook/
