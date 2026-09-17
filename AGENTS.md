# AGENTS.md — MDE AI

Portable repository guidance for coding agents working from the current Git checkout root.

## Repository truth

- Remote: `https://github.com/amoai-tech/mdeai.git`.
- Package/app source lives at the repository root.
- Main stack: Next.js 16, React 19, CopilotKit 1.55.2 v2 APIs, Mastra, Supabase, Gemini, Google Maps, Cloudinary, Playwright, and Vitest.
- `.claude/skills/` is the canonical project skill library.
- Linear is the durable task/progress source of truth for substantial SAN work.
- Never rely on machine-specific absolute paths; resolve the current checkout root dynamically.

## Skill routing

Use the narrowest owner directly:

- Simple domain/stack work → relevant specialist skill.
- Substantial or ambiguous implementation → `tasks`.
- Unknown failure/root cause → `systematic-debugging`.
- Test strategy → `testing`; test-first implementation → `tdd`.
- Existing diff/PR review → `code-review`.
- Research/evidence gathering → `research`.
- Done/merge/production claim → `task-verifier`.
- UI state/interaction design → `wireframe`.
- Architecture/state/dependency visualization → `mermaid-diagrams`.

SAN-1273 will add the lightweight routing layer later. Do not restore the retired `using-mde-skills` router or `mde-task-lifecycle` workflow.

## Canonical skills

Stack: `copilotkit`, `mastra`, `supabase`, `gemini`, `maps`, `stripe`, `nextjs`, `cloudinary`, `mde-vercel`.

Domain: `events`, `real-estate`.

Workflow: `tasks`, `systematic-debugging`, `testing`, `tdd`, `research`, `code-review`, `task-verifier`, `writing-skills`, `wireframe`, `mermaid-diagrams`.

## Shared invariants

Do not duplicate detailed operating rules here when a canonical skill owns them. Load the relevant skill and follow its current instructions.

- Git/worktree safety and execution sequencing → `tasks`.
- Verification and anti-fake-Done requirements → `task-verifier`.
- Root-cause methodology → `systematic-debugging`.
- Test selection and regression proof → `testing` / `tdd`.
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
