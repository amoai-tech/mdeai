# Intent → specification → implementation plan (MDE AI)

**Purpose:** give agents a small, durable context chain for complicated MDE work. Root [spec.md](../../../spec.md) defines the shared acceptance contract, and root [plan.md](../../../plan.md) is the current reusable implementation/CopilotKit component-first playbook. The task-local templates below are optional for substantial handoffs; none is a second tracker, runtime or development approval gate. This supplements [the existing agent collaboration plan](../agent-workflow-plan.md).

## Start here

1. Read [`AGENTS.md`](../../../AGENTS.md), the relevant `.claude/skills/tasks/SKILL.md`, and the live Linear issue before drafting.
2. Inspect current `main`, the task branch/PR, relevant code, and tests; distinguish evidence from assumptions.
3. For a **substantial or ambiguous S2–S4 task**, copy the three templates into a single task folder when the detail will genuinely help future sessions. If adding Markdown files under `docs/07-operations/`, add a corresponding row for **each new file** in the complete active documentation catalog in `docs/index-docs.md` (required by `npm run check:docs`). For a focused S0/S1 fix, use the Linear issue and existing `implement` skill instead. No docs-only gate for normal development.
4. Draft [`intent.md`](templates/intent.md) (**why / problem**) → [`spec.md`](templates/spec.md) (**what / observable behavior**) → [`plan.md`](templates/plan.md) (**how / exact implementation and proof**). Resolve contradictions against the live issue and source before coding.
5. Follow the existing `tasks` and `implement` skills to edit the *real* code; run the smallest decisive tests first. Record progress/PRs/evidence in **Linear**, not a second task tracker. Update files when a decision or interface changes.
6. Before handoff, record verified state, remaining work, blockers and the next command in Linear. Do not mark a feature Done because the Markdown is complete.

## What owns what?

| Source | Owner; not a duplicate of... |
| --- | --- |
| `AGENTS.md` | Invariants, Phase A development policy, security, skill routing |
| Root `spec.md` / `plan.md` / `REVIEW.md` | Shared acceptance contract / execution playbook / review evidence rules; not per-issue live status |
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

## Verified external playbooks — choices for MDE (22 Nov 2026)

The sources below are **references to adapt**, not instructions to install new frameworks, replace Linear or add business gates. Every adopted practice points to a current MDE document and a way to verify it. The sources are not evidence that MDE's production journey works.

| Source | Decision | MDE destination and observable verification |
| --- | --- | --- |
| [Anthropic — AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook) | **ADAPT** its Plan → Design → Build → Test → Deploy → Maintain **feedback loop**, with readable handoff artifacts and review/test moving alongside fast implementation. **Do not copy its automatic artifact-triggered approval chain** into Phase A. | Root [plan.md](../../../plan.md) six-stage table; issue/PR names exact outcome, commit, proof and next action without creating six tickets |
| [Florian Bruniaux — Spec-first workflow](https://github.com/FlorianBruniaux/claude-code-ultimate-guide/blob/main/guide/workflows/spec-first.md) | **MODEL** vertical slices, scope exclusions and runnable acceptance; **do not adopt the recommendation that Claude-only `CLAUDE.md` is the canonical spec** in a multi-agent MDE repository. | Root [spec.md](../../../spec.md), optional task templates and shared [AGENTS.md](../../../AGENTS.md); a renter action has an `AC-#` and a testable persisted result |
| [Florian Bruniaux — workflow library](https://github.com/FlorianBruniaux/claude-code-ultimate-guide/tree/main/guide/workflows) | **REFERENCE ONLY** for TDD, plan-driven worktrees, code review, test-driven debugging and source exploration. MDE already has `tasks`, `efficient`, `tests`, `praudit` and scoped specialist skills; **do not copy third-party slash commands or add competing reviewers**. | Current [tasks skill](../../../.claude/skills/tasks/SKILL.md), [root plan](../../../plan.md); pass the same issue and test command through a single implementation branch |
| [Official Claude Code — common workflows](https://code.claude.com/docs/en/common-workflows) | **ADAPT** source-first exploration, optional planning for complex tasks, independent worktrees for parallel agents and test verification after changes. | [AGENTS.md](../../../AGENTS.md) session/parallel guidance and [plan.md](../../../plan.md); concurrent agents cannot edit the same RPC, shared catalog or dirty worktree |
| [Spec Coding](https://spec-coding.dev/) | **ADAPT** lightweight problem, goal, plan, out-of-scope, acceptance/evidence packet; **skip heavyweight SDD documents for S0/S1**. | Root [spec.md](../../../spec.md) mini-template, [task templates](templates/spec.md); issue contains `AC-#`, an error/retry case and real proof rather than more prose |
| [AGENTS.md open format](https://agents.md/) | **ADAPT** portable root agent commands, security, test commands and repository ownership. **Do not duplicate** CLAUDE-specific adapters or introduce nested instructions without a distinct directory owner. | Root [AGENTS.md](../../../AGENTS.md) and existing [CLAUDE.md](../../../CLAUDE.md); `CLAUDE.md` imports the canonical shared rules via `@AGENTS.md` |
| [Official Claude Code — customize code review](https://code.claude.com/docs/en/code-review-customize) | **ADAPT** root review-only guidelines, material severity, a small nit budget, CI/generated-output exclusions and proof-first comments; **do not install another review engine**. Crucially, managed Claude Code Review reads `REVIEW.md` from the **base/default branch, not the PR head**. | Root [REVIEW.md](../../../REVIEW.md), existing [PR review guidelines](../../06-testing/pr-review-guidelines.md); new review rules become available to that managed reviewer after merging, with current PR-Agent/CI unchanged |

**Source-to-change principle:** Prefer **ADAPT** (specific language and proof) over **COPY** (entire framework); future contributors should recheck current upstream details against the installed MDE code and actual GitHub/Linear state. None of these links is an instruction to run or accept a provider's suggested commands unreviewed. Do not claim time savings without a measured before/after sample.

## Measure the real-world benefit

For the next substantial **implementation** issue, use a live Linear task rather than creating a demonstration-only issue. Capture the time to the first decisive test and count repeated investigation loops, unnecessary duplicate changes and valid review corrections in that same Linear issue. Compare with up to three comparable past tasks **only when evidence exists**. Without a credible baseline, report the actual numbers and **do not claim time savings**. The worked SAN-1653 example is a starting context, not a completed feature pilot.

## Pilot and limits

See [SAN-1653 example](examples/SAN-1653/intent.md). It documents the real task and a planned proof route; **this docs PR does not implement or certify the Gen UI feature**. A future agent must execute the task's real tests/browser checks before claiming success.

**Phase A policy:** Do not make ownership verification, publication approval, booking, photo-rights paperwork, or launch certification prerequisites to development. Continue enforcing authentication, server authorization, RLS, data truth, transaction integrity, retries and privacy per `AGENTS.md`.

**Do not create** a second search engine, agent, provider, database, `tasks.md`, task-sync service, PR per spec stage, or duplicate Linear issue.
