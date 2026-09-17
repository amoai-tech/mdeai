---
name: tasks
description: >-
  Use when creating, planning, executing, resuming, or completing a substantial MDE Linear SAN task.
metadata:
  version: "2.0.0-mde.1"
---

# tasks — MDE Linear task specification standard

**Purpose:** define and execute substantial MDE Linear work end-to-end while keeping live Linear as the resumable progress/evidence contract.

## Ownership

```text
tasks
= define + execute substantial MDE task work end-to-end

domain skills
= implementation-specific contracts for Supabase, Mastra, CopilotKit, Cloudinary, Next.js, etc.

task-verifier
= independent evidence gate that proves claims and Done
```

The Linear issue is the live task-specific execution runbook and progress source of truth.

## Outcome + prompting contract

When this task creates or materially changes a skill, also follow [`references/shared/skill-authoring-standard.md`](references/shared/skill-authoring-standard.md).

For every substantial S2-S4 task, define the durable outcome and independently gradeable rubric before implementation. Use [`references/shared/outcome-rubric-standard.md`](references/shared/outcome-rubric-standard.md).

Write substantial task instructions and handoffs using [`references/shared/prompting-standard.md`](references/shared/prompting-standard.md). Keep S0/S1 prompts proportionally smaller. `/goal` may extend a long-running session toward an already-defined outcome, but it never replaces Linear scope, permissions, STOP conditions, or independent verification. Because the `/goal` evaluator only sees surfaced conversation evidence, decisive test/build/runtime results must be reported explicitly.

When delegation is useful, follow [`references/shared/subagent-standard.md`](references/shared/subagent-standard.md). Normal subagents do not inherit the parent system prompt or conversation context; pass all task-critical scope, constraints, evidence requirements, and STOP conditions explicitly.

## Formal build orchestrator

`tasks` is the build orchestrator for substantial MDE work. It may be invoked directly or by a future lightweight router; once invoked, this skill owns execution sequencing.

At task start:

1. Classify task complexity locally: **S0 trivial**, **S1 focused**, **S2 coordinated**, **S3 substantial cross-system**, **S4 production-sensitive risk**.
2. For **S0**, do not use this orchestrator unless the user explicitly asks for a Linear task.
3. For **S1**, keep one primary execution path and minimal supporting skills.
4. For **S2–S4**, build a dependency-aware step graph using [orchestration-contract.md](references/orchestration-contract.md).
5. Persist resumable state in Linear using [linear-handoff.md](references/linear-handoff.md).

Use an adaptive control loop, not a fixed ceremony: **choose the next dependency-safe step → load the owning specialist → execute → observe evidence → update Linear → continue, reroute, or stop**.

### Failure policy

Use this local policy:
- transient network/rate-limit failures may retry up to the configured limit;
- optional evidence sources may be skipped only with an explicit limitation;
- failed decisive tests reroute to `systematic-debugging`;
- schema/runtime, security/RLS, payment/duplicate-side-effect blockers abort the current implementation path;
- destructive uncertainty requires user approval.

### Safe parallelization

Parallelize only independent steps whose dependencies are complete, which do not mutate the same source of truth, and which do not require one another's output. Discovery can often fan out; unresolved schema/API/interface chains must serialize.

## Source of truth

1. Current runtime/live state when applicable.
2. Current code baseline after resolving the active PR base, parent branch, or merge-base. Use `origin/main` only when it is the relevant base or already contains inherited stacked-branch changes.
3. Live Linear task for scope, acceptance criteria, ownership, priority, and status.
4. Canonical current docs under `docs/`.
5. Archived/historical/reference material last.

If a lower source conflicts with a higher one, follow the higher source and flag the lower source as stale.

## PR policy — fewest necessary

A SAN task does **not** automatically require its own PR. Create the fewest independently reviewable PRs needed to ship safely. Keep fixes, verification, evidence, and docs in the existing task PR when they belong to the same outcome. Split only for a real dependency, risk boundary, ownership boundary, or independently shippable change. Never create extra PRs merely to record review or verification work.

## Top Task Snapshot — mandatory

Put this immediately after the title so a product/operator can understand the task before reading implementation detail:

```text
What changes: <2–4 plain-English lines>
Real-world example: <actor → action → visible/durable result>
Faster/better approach: <smallest safe proven path>
Current status: <Todo / In Progress / Blocked + verified progress %>
Complexity: <S0 / S1 / S2 / S3 / S4 + one-line reason>
Tech stack touched: <only affected systems>
Skills/MCPs: <only tools actually required and why>
Production-ready when: <one observable success sentence>
```

If any line is unknown, say `Needs verification` instead of guessing.

## Mandatory task structure

Every substantial executable `SAN-*` task is a dependency-ordered runbook. Keep it compact; include only sections that change execution or proof.

1. **Title + Top Task Snapshot** — plain English outcome, status, stack, skills/tools, production-ready sentence.
2. **Verified current state** — what exists now, what is actually missing, and what must not be rebuilt.
3. **User/business outcome** — actor → action → observable result; add the smallest useful Mermaid view for cross-system/stateful work.
4. **Scope + ownership** — requirement vs recommended implementation, affected systems, authoritative owner/source of truth.
5. **Dependencies + STOP conditions** — blockers, prerequisite tasks, invalid assumptions, go/no-go branches.
6. **Definition of Done** — measurable acceptance criteria tied to observable evidence.
7. **Ordered implementation runbook** — smallest safe file/workflow groups, each with an explicit checkpoint and proof.
8. **Risk contracts** — security, RLS/data integrity, HITL, payments, external side effects, performance only when relevant.
9. **Test strategy** — cheapest decisive proof first; add negative/recovery and user/AI journey proof where applicable.
10. **PR + exact-head CI** — use the fewest necessary PRs; resolve review comments as hypotheses, not commands.
11. **Post-merge verification** — prove the exact merged/deployed outcome, not merely the merge.
12. **Handoff** — verified progress, residual risk, exact next action; Linear remains the live status record.

For agent-prompt structure, read [agent-instructions.md](references/agent-instructions.md).
For detailed layout, read [task-format.md](references/task-format.md).
For progress rules, read [progress-tracker.md](references/progress-tracker.md).
For legacy/reference migrations, use [migration-legacy.md](references/migration-legacy.md) only when a task explicitly ports behavior from a historical or external reference repository.
Before commit, read [pre-commit.md](references/pre-commit.md), then choose the risk-matched verification set from [pre-merge-tests.md](references/pre-merge-tests.md).
For PR creation/troubleshooting, read [github-pr.md](references/github-pr.md), [review-comments.md](references/review-comments.md), [domain-routing.md](references/domain-routing.md), [research-evidence.md](references/research-evidence.md), and [github-actions.md](references/github-actions.md).
For user-facing or AI-native workflows, read [user-journey-testing.md](references/user-journey-testing.md).
For UI-heavy work, read [ui-review.md](references/ui-review.md).
Load `../mermaid-diagrams/SKILL.md` only when architecture, ownership, state, sequence, dependencies, trust boundaries, or failure/recovery paths are non-trivial enough that a diagram can expose errors.
After merge, read [post-merge.md](references/post-merge.md). `mde-task-lifecycle` is retired; `tasks` is the canonical task lifecycle.

## Explicit action vocabulary

Never use `adapt` by itself. Use: **COPY**, **COPY + CLEAN**, **COPY + CLEAN TOKENS**, **PORT**, **REIMPLEMENT USING CURRENT MDE PATTERN**, **EXTRACT + REUSE**, **COPY UI STRUCTURE + REWRITE DATA/WORKFLOW LOGIC**, **REWRITE**, **MOVE TO SAN-XXX · TASK-ID — Full Task Name**, or **DROP**.

## Ticket decomposition — vertical slices first

When a task must be split, prefer **tracer-bullet vertical slices** over layer-by-layer tickets. Each child ticket should deliver one narrow, complete, independently demoable or verifiable outcome across every layer it genuinely needs.

Rules:
- Each slice must fit in one fresh agent context when practical.
- Declare real blocking edges explicitly; a ticket with no blockers may run in parallel.
- Do not create separate "DB", "API", "UI", and "tests" tickets when none is useful alone.
- Prefer the smallest end-to-end behavior: for example, "host publishes one event" may include schema/API/UI/tests in one ticket.
- Prefactoring may be a prerequisite ticket when it makes the vertical slice materially simpler or safer.

### Wide-refactor exception — expand → migrate → contract

A wide mechanical refactor whose blast radius cannot stay green as a vertical slice should use **expand → migrate → contract** instead:

1. **Expand:** introduce the new contract beside the old without breaking callers.
2. **Migrate:** move callers in independently green batches sized by the real dependency graph.
3. **Contract:** remove the old contract only after every migration batch is proven complete.

If even migration batches cannot stay green independently, use an explicit integration branch and a final integrate-and-verify ticket. Do not pretend a horizontal breaking change is a tracer bullet.

## Required execution behavior

- For substantial code work or cross-file dependency/blast-radius discovery, use Graphify first when `graphify-out/graph.json` exists: run `PATH="$HOME/.local/bin:$PATH" graphify query "<question>"`, then use `graphify path` / `graphify explain` for focused relationships and the wiki index for broad navigation. For a narrow docs/config-only task with an already-known target where Graphify adds no useful proof, use direct inspection and record `Graphify: N/A — <reason>`.
- Resolve the active PR base, parent branch, or merge-base before trusting the issue text or inherited implementation. Inspect clean `origin/main` only when it is the relevant base or already contains the inherited stacked changes.
- Reuse the current MDE implementation before historical/reference code or custom code.
- Before implementation, classify risk domains: auth/tenant, Supabase schema/migration, privileged DB function/RPC, consequential AI/HITL, external side effect/webhook, payment/publishing, production config, dependency/Action. Any high-risk domain requires Adversarial task-verifier coverage.
- For Mastra work, also classify applicable risk domains: **agent registry/identity, model/provider, tool schema, tool authority, external side effect, RequestContext/tenant context, memory resource/thread scope, persistent storage, streaming/Stop/abort, workflow, suspend/resume, HITL approval, MCP, observability/evals, Mastra package-family change**. Tenant identity, memory ownership, consequential tools, approval/resume, callback/webhook continuation, persistent storage, cancellation, MCP auth, or package-family changes automatically require Adversarial task-verifier coverage.
- Record verification ownership: **WHAT must be proven → task-verifier; HOW domain correctness is proven → owning domain skill; automated regression → test/CI owner.**
- For Supabase/Postgres work, identify applicable proof classes before coding: catalog, behavioral, authorization/tenant, migration replay, performance/exposure, live read-only. Route the HOW to `supabase`; never reconstruct an existing DB object from memory or task prose.
- For Mastra work, identify applicable proof classes before coding: registry/config, deterministic primitive, model behavior, authority/context, memory, persistence/restart, HITL artifact, resume/recovery, streaming/abort, side-effect idempotency, observability/evals, exact runtime. Route the HOW to `mastra`; do not let one proof class substitute for another.
- Implement one file/group at a time; do not bulk-copy folders.
- For legacy/reference migrations, classify mixed-responsibility files at the **symbol/behavior/invariant** level, not one blanket action per file. Pin immutable source SHAs and record current owner/source of truth, legacy risk, target, and proof for every reused behavior.

- Every implementation group must contain an explicit **Checkpoint:** block with the exact success criterion, proof command/test/runtime evidence, and STOP rule. “Checkpoint implied by tests” is not enough.
- Every task must include a concise **Current-state audit** before implementation: what exists, what is missing, errors/red flags/failure points/blockers, recommended fixes, and what must not be rebuilt.
- Every substantial task must name the **affected tech stack** and the **skills/MCPs/CLIs/dashboards** actually required. Do not dump the whole platform stack.
- Put a plain-English **real-world user journey** near the top. For cross-system or AI-native work, add Mermaid for the journey and any material ownership/trust/failure path.
- Include evidence-based **scores/grades /100** only when useful; mark them provisional when evidence is incomplete and explain deductions.
- Before merge, include an explicit production-readiness checklist and the risk-matched tests from `pre-merge-tests.md`; after merge, include the exact actions/tests from `post-merge.md`.
- For every important external/reference URL, place the **full URL inside the exact implementation step that uses it**. Each URL-bearing step must state: Inspect → explicit action → current owner/source of truth → exact MDE target → reuse/adapt → defer/drop → avoided custom work → constraints → checkpoint. A detached reference table is summary only.
- If the same source informs multiple steps, repeat the full URL in each step with a narrower instruction for the exact invariant used there; never write only `same URL` in the execution runbook.
- For mutable GitHub sources, keep the human-readable branch URL for navigation but resolve and record an immutable commit SHA/pinned URL in implementation/PR evidence.
- Run the cheapest reliable proof after each file/group before moving on.
- Keep requirement/user outcome separate from the recommended implementation so current evidence can improve the plan without changing the goal.
- Provide known relevant context, explicit IF → THEN edge cases, successful-stop conditions, and invalid-assumption STOP conditions.
- Use examples for ambiguous migration/reuse instructions instead of vague verbs.
- Before commit, run the pre-commit defect-prevention gate, local automated review when available, and the risk-matched pre-merge test matrix; verify load-bearing external contracts.
- Treat PR comments as hypotheses: classify, route to the owning domain skill/MCP, verify, then fix/reply/resolve with evidence.
- Define affected business-critical user journeys and certify both system correctness and AI correctness when AI participates.
- Named third-party testing/review tools are not MDE defaults unless this repository contains a pinned, reproducible setup or an explicit approved task owns the adoption decision. Explorbot is the currently selected exploratory-testing pilot; it is not a mandatory merge gate until a repository-owned path is approved.
- When architecture, state, ownership, sequence, trust boundaries, dependencies, or failure/recovery paths are materially non-trivial, use `mermaid-diagrams` before implementation to expose missing owners, duplicate side effects, auth/tenant gaps, circular dependencies, unowned failures, or missing evidence. Otherwise record `Mermaid: N/A — <reason>`.
- Use the smallest diagram only for sections where it materially improves reasoning. Do not require a diagram per file/group and do not add decorative filler diagrams.
- If code inspection disproves a planned diagram, update the diagram and Linear plan before coding; never force implementation to match a stale diagram.
- Update Linear progress after every verified checkpoint.
- If a completed checkpoint regresses, uncheck it and reduce the percentage.
- Never set `100%` or Linear `Done` until post-merge observable verification passes.

## Progress formula

```text
Overall completion % =
verified applicable leaf units with `Done [x]`
÷ total applicable leaf units
× 100
```

Parent workflow rows are roll-ups only when expanded into child rows. Implementation/Verification boxes are gates, not separate percentage units. Verified `N/A` leaf units are excluded from the denominator. Round to the nearest whole percent.

## Faster/better approach

At task start and each major phase ask once: **Is there a better, faster, more efficient way to complete this without weakening evidence?** Use that path.

## Handoff contract

A different agent must be able to resume from the Linear issue alone and know: current state, verified progress, exact next file/workflow, evidence, blockers, and remaining Done gates.

## Core agent prompt

```text
You are executing one substantial MDE Linear task. Classify it S1–S4, use this skill as the build orchestrator, and load only the domain/reasoning skills needed for the current dependency-safe step. Verify current code/runtime before trusting task assumptions. For S2–S4 work, maintain explicit step inputs, outputs, dependencies, parallel-safety, and failure policy; persist the current orchestration handoff in Linear. Use Mermaid only when non-trivial architecture/state/sequence/dependencies/failure paths benefit from it. Keep the user outcome separate from the proposed implementation, use the smallest safe solution, and record evidence after each checkpoint. Stop or reroute when the canonical failure policy requires it. Finish only when the observable Definition of Done and required post-merge proof are verified.
```
