# CLAUDE.md — MDE AI

Project guidance for Claude Code working from the repository root.

## Repository truth

- Repo root: the current Git checkout root
- Remote: `https://github.com/amoai-tech/mdeai.git`
- Package name: `mdeapp`
- App source lives directly at the repository root.
- Main stack: Next.js 16, React 19, CopilotKit 1.55.2 v2 APIs, Mastra, Supabase, Gemini, Google Maps, Playwright, Vitest.
- `.claude/skills/` is the canonical project skill library.
- Linear is the durable task/progress source of truth for substantial SAN work.

## Skill routing

For simple work, use the directly relevant skill and do not add orchestration.

For substantial or ambiguous work:
1. For substantial or ambiguous work, start with `tasks`; it owns dependency-safe execution and specialist selection. SAN-1273 will add the lightweight router later.
2. `tasks` owns substantial implementation orchestration.
3. Load only the affected stack/domain skills.
4. `systematic-debugging` owns diagnosis when a failure is not understood.
5. `testing` owns verification strategy, test-first implementation, and RED → GREEN → REFACTOR regression proof.
6. `code-review` reviews an existing diff or PR.
7. `task-verifier` independently challenges Done/merge/production claims.
8. Persist S2-S4 handoff state in Linear.

## Canonical skills

Stack skills:
- `copilotkit`
- `mastra`
- `supabase`
- `gemini`
- `maps`
- `stripe`
- `nextjs`
- `cloudinary`
- `mde-vercel`

Domain skills:
- `events`
- `real-estate`

Workflow skills:
- `tasks`
- `systematic-debugging`
- `testing`
- `code-review`
- `task-verifier`
- `research`
- `writing-skills`
- `wireframe`
- `mermaid-diagrams`

Retired: `mde-task-lifecycle`, `lean-dev-flow`, `mde-worktree-pr-flow`, `copilotkit-debug`, `copilotkit-integrations`, `copilotkit-setup`. Task lifecycle/execution belongs to `tasks`; independent Done/merge/production proof belongs to `task-verifier`.

## Hard rules

- Production AI uses Gemini. Verify current model/provider contracts before changing model names.
- CopilotKit stays on the v2 API surface; do not mix bare v1 imports with `/v2` imports.
- New Supabase tables require RLS and an explicit authorization policy.
- Never expose service-role secrets to client code.
- Google Places requests must use intentional field masks; Maps markers require the correct map configuration.
- Do not mark work Done without current evidence from the relevant tests/runtime.
- Do not reset, clean, or discard unrelated working-tree changes.
- Prefer the fewest necessary independently reviewable PRs.
- Treat repo skills as trusted executable instructions: review skill changes before relying on them.

## Verification

Before committing skill-system changes, run:

```bash
git diff --check
```

Structural eval definitions are specifications only until they are actually executed. Never report an eval as passing merely because its JSON validates.

## Response style

Lead with the answer. Keep explanations concise, concrete, and tied to MDE when useful. Always pair task numbers with task names.
