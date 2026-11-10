# Intent → specification → implementation plan (MDE AI)

**Purpose:** give agents a small, durable context chain for complicated MDE work. This supplements [the existing agent collaboration plan](../agent-workflow-plan.md), not a new tracker or agent runtime.

## Start here

1. Read [`AGENTS.md`](../../../AGENTS.md), the relevant `.claude/skills/tasks/SKILL.md`, and the live Linear issue before drafting.
2. Inspect current `main`, the task branch/PR, relevant code, and tests; distinguish evidence from assumptions.
3. For a **substantial or ambiguous S2–S4 task**, copy the three templates into a single task folder when the detail will genuinely help future sessions. For a focused S0/S1 fix, use the Linear issue and existing `implement` skill instead. No docs-only gate for normal development.
4. Draft [`intent.md`](templates/intent.md) (**why / problem**) → [`spec.md`](templates/spec.md) (**what / observable behavior**) → [`plan.md`](templates/plan.md) (**how / exact implementation and proof**). Resolve contradictions against the live issue and source before coding.
5. Follow the existing `tasks` and `implement` skills to edit the *real* code; run the smallest decisive tests first. Record progress/PRs/evidence in **Linear**, not a second task tracker. Update files when a decision or interface changes.
6. Before handoff, record verified state, remaining work, blockers and the next command in Linear. Do not mark a feature Done because the Markdown is complete.

## What owns what?

| Source | Owner; not a duplicate of... |
| --- | --- |
| `AGENTS.md` | Invariants, Phase A development policy, security, skill routing |
| `CLAUDE.md` | Claude-only adapter to shared instructions |
| Linear issue | Exact title, status, priority, dependencies, current acceptance and progress |
| `prd.md` / `roadmap.md` / `mvp.md` | Product requirements / strategy / public-launch definition |
| `intent.md` per task | Stable problem, users, outcome, constraints; no implementation design |
| `spec.md` per task | Testable behavior/contracts, edge cases and source truth |
| `plan.md` per task | Smallest code changes, order, STOP criteria, verification and handoff links |
| GitHub `main` + tests + live database | Actual implementation and runtime truth; never infer "shipped" from documents |

**Naming:** `docs/07-operations/intent-spec-plan/examples/SAN-1653/` demonstrates the pattern using a *real* Gen UI issue. For actual work, add a task directory only when it pays for itself; otherwise keep the plan in Linear. Use an exact verified `SAN-#### · Linear title` when referring to a task.

**Status vocabulary:** `Draft` / `Ready to implement` / `In progress` / `Verified` applies only to *documents*. It is **not** Linear issue status, deployment status, or feature certification.

## Agent adoption

- **Claude Code:** `CLAUDE.md` imports `AGENTS.md`; the `tasks` skill links this guide. Do not assume Claude auto-loads arbitrary `intent.md`, `spec.md`, or `plan.md` files. Read the relevant files explicitly.
- **Codex and compatible coding agents:** `AGENTS.md` and the mirrored `.agents/skills/tasks/` route to the same guide. Explicitly request the three files when resuming a complex task.
- **ChatGPT / MCP agents:** use GitHub/Linear/connected Desktop Commander to read the same files and continue work. No additional plugin or shadow task system is required.

**Recommended task-start prompt:** "Read AGENTS.md, the tasks and implement skills, and the exact Linear issue. Check whether an intent/spec/plan folder exists for this SAN issue. If complexity warrants it, write or update only the missing facts, then implement the smallest tested change. Linear owns live progress."

## Why this small approach?

| Option | Fit for the existing MDE repo | Trade-off | Decision |
| --- | --- | --- | --- |
| Existing skills + three Markdown templates | Excellent: no new runtime/dependencies or task registry | Requires agents to load the task files explicitly | **ADOPT** |
| GitHub Spec Kit | Useful staged specification, planning and convergence process | Adds command/integration/state setup overlapping MDE `tasks` | Reference only; revisit if repeated evidence shows a gap |
| Larger orchestration framework | Useful in large teams with many repeated handoffs | Duplicates Linear/worktrees/skills and expands maintenance | Do not adopt for this scope |

**Research and decision receipts (read in Nov 2026):**

- https://academy.claude.com/courses/ai-native-sdlc-playbook/capture-intent — **MODEL** a concise originator-authored, versioned intent; target `templates/intent.md`; verify presence of problem/outcome/constraints.
- https://github.com/github/spec-kit — **REFERENCE ONLY**: specify → plan → tasks → implement → converge; keep existing `tasks` skill, not a second runner; verify source-of-truth table and no `.specify` installation.
- https://code.claude.com/docs/en/memory — **ADAPT** explicit agent instruction loading; target `.claude/skills/tasks/SKILL.md`; `npm run check:skills` verifies canonical skill/mirror shape (not actual model behavior).
- https://github.com/Digital-Tvilling/plan.md — **REFERENCE ONLY** Markdown portability; no separate schema standard needed; verify templates are plain text and agent-neutral.
- https://www.datacamp.com/tutorial/spec-driven-development-with-claude-code — **REFERENCE ONLY** third-party comparison of heavier workflows; no new dependency or forced phase gates.

## Pilot and limits

See [SAN-1653 example](examples/SAN-1653/intent.md). It documents the real task and a planned proof route; **this docs PR does not implement or certify the Gen UI feature**. A future agent must execute the task's real tests/browser checks before claiming success.

**Phase A policy:** Do not make ownership verification, publication approval, booking, photo-rights paperwork, or launch certification prerequisites to development. Continue enforcing authentication, server authorization, RLS, data truth, transaction integrity, retries and privacy per `AGENTS.md`.

**Do not create** a second search engine, agent, provider, database, `tasks.md`, task-sync service, PR per spec stage, or duplicate Linear issue.
