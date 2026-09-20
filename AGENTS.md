# AGENTS.md — MDE AI

Portable repository guidance for coding agents working from the current Git checkout root.

## Repository truth

- Remote: `https://github.com/amoai-tech/mdeai.git`.
- Package/app source lives at the repository root.
- Main stack: Next.js 16, React 19, CopilotKit 1.55.2 v2 APIs, Mastra, Supabase, Gemini, Google Maps, Cloudinary, Playwright, and Vitest.
- `.claude/skills/` is the canonical project skill library. `.agents/skills/` exposes the same canonical skills to Codex via symlinks so both agents use one source of truth.
- Linear is the durable task/progress source of truth for substantial SAN work.
- Never rely on machine-specific absolute paths; resolve the current checkout root dynamically.

## Skill routing

Use the narrowest owner directly. When ownership is ambiguous, use `using-mde-skills` to choose exactly one canonical execution owner and then stop routing:

Known domain beats generic workflow.

If the request clearly names or belongs to a canonical domain skill, route directly to that domain even when the request contains words such as bug, broken, failing, error, debug, or troubleshoot.

Use `systematic-debugging` only when the responsible domain/root cause is genuinely unknown.

- Simple domain/stack work → relevant specialist skill.
- Substantial or ambiguous implementation → `tasks`.
- Unknown failure/root cause → `systematic-debugging`.
- Test strategy, test-first implementation, and regression proof → `testing`.
- Existing diff/PR review → `code-review`.
- Research/evidence gathering → `research`.
- Done/merge/production claim → `task-verifier`.
- UI state/interaction design → `wireframe`.
- Architecture/state/dependency visualization → `mermaid-diagrams`.

`using-mde-skills` is the active lightweight ambiguity router. Do not restore retired lifecycle owners (`mde-task-lifecycle`, `lean-dev-flow`, or `mde-worktree-pr-flow`) or the old PR #45 routing machinery. Lifecycle/execution routes to `tasks`; independent Done/merge/production proof routes to `task-verifier`. S4 safety applies even when ownership is obvious and the router is bypassed. Treat payments/financial side effects, auth/RLS/tenant-boundary changes, secrets/security controls, destructive or irreversible production-data changes, and duplicate/retry-sensitive irreversible external side effects as S4; only those S4 requests require independent `task-verifier` verification before completion. Ordinary domain bugs and implementation work do not automatically become S4.

## Canonical skills

Stack: `copilotkit`, `mastra`, `supabase`, `gemini`, `maps`, `stripe`, `nextjs`, `cloudinary`.

Domain: `events`, `real-estate`.

Workflow: `using-mde-skills`, `tasks`, `systematic-debugging`, `testing`, `research`, `code-review`, `task-verifier`, `writing-skills`, `wireframe`, `mermaid-diagrams`.

## Graphify repo intelligence

Before broad repository searching on substantial code tasks:

1. Check whether `graphify-out/graph.json` exists and is current.
2. Prefer Graphify for exact symbols, dependency paths, affected-code discovery, and blast-radius analysis.
3. Use `npm run graphify:query -- "<question>"`, `npm run graphify:explain -- "<symbol>"`, and `npm run graphify:path -- "<A>" "<B>"` before broad raw-file search when they fit the question.
4. Fall back to normal search when the question is conceptual, Graphify has no useful match, runtime behavior needs verification, or direct source evidence is more appropriate.
5. Treat static graph results as navigation evidence rather than sufficient deletion proof; confirm risky conclusions against source, runtime behavior, and relevant tests.

## Ponytail engineering rule

Before writing custom code, prefer the earliest rung that safely satisfies the task: skip unnecessary work; reuse existing repository code; prefer the standard library or native platform; reuse an installed dependency; use a small direct change; only then add the minimum new implementation required. Preserve required validation, error handling, security, accessibility, data integrity, and tests rather than trading them away merely to reduce code size.

## Shared invariants

Do not duplicate detailed operating rules here when a canonical skill owns them. Load the relevant skill and follow its current instructions.

- Git/worktree safety and execution sequencing → `tasks`.
- Verification and anti-fake-Done requirements → `task-verifier`.
- Root-cause methodology → `systematic-debugging`.
- Test selection, TDD, and regression proof → `testing`.
- Supabase auth/RLS/service-role rules → `supabase`.
- CopilotKit/AG-UI integration rules → `copilotkit`.
- Mastra agent/tool/workflow rules → `mastra`.
- Google Maps/Places field masks and marker configuration → `maps`.
- Gemini model/provider details → `gemini`.

Repository-wide invariants that remain explicit:

- Never expose secrets or service-role credentials to client code.
- Do not reset, clean, or discard unrelated working-tree changes.
- Do not mark work Done without current evidence from the relevant tests/runtime.
- Prefer the fewest necessary independently reviewable PRs.
- Treat repository skills as trusted executable instructions: review skill changes before relying on them.

## Verification

For skill/bootstrap changes, run the narrow checks first:

```bash
git diff --check
node --check .claude/hooks/session-start.mjs
node .claude/hooks/__tests__/session-start.test.mjs
```

Then validate changed-file links, skill metadata/frontmatter, eval JSON, and stale router dependencies. Run the full application Floor on the final landing stack or whenever runtime/source/config changes require it.

## Application context

Representative product surfaces include `/`, `/chat`, `/events`, `/rentals`, `/restaurants`, `/cafes`, `/nightlife`, `/trips`, `/host/*`, `/admin/event-bookings`, and `/api/copilotkit/[[...path]]`.

This bootstrap file does not define product behavior. Current source code, current tests, current Linear tasks, and the owning skills are authoritative.

## Response style

Lead with the answer. Keep explanations concise, concrete, and tied to MDE. Always pair task numbers with task names.
