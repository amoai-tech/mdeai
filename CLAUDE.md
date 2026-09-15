# CLAUDE.md — MDE AI

Project guidance for Claude Code working in `/home/sk/mdeai`.

## Repository truth

- Repo root: `/home/sk/mdeai`
- Remote: `https://github.com/amoai-tech/mdeai.git`
- Package name: `mdeapp`
- App source lives directly in this repository; there is no `/home/sk/mdeai/mdeapp/` child repo.
- Main stack: Next.js 16, React 19, CopilotKit 1.55.2 v2 APIs, Mastra, Supabase, Gemini, Google Maps, Playwright, Vitest.
- `.claude/skills/` is the canonical project skill library.
- Linear is the durable task/progress source of truth for substantial SAN work.

## Skill routing

For simple work, use the directly relevant skill and do not add orchestration.

For substantial or ambiguous work:
1. Use `using-mde-skills` to classify S0-S4 and select one primary owner.
2. `tasks` owns substantial implementation orchestration.
3. Load only the affected stack/domain skills.
4. `systematic-debugging` owns diagnosis when a failure is not understood.
5. `testing` owns verification strategy; `tdd` owns test-first implementation.
6. `code-review` reviews an existing diff or PR.
7. `task-verifier` independently challenges Done/merge/production claims.
8. Persist S2-S4 handoff state in Linear.

## Canonical skills

Stack skills:
- `copilotkit`
- `mastra`
- `supabase`
- `gemini`
- `mde-maps` (rename to `maps` is planned; use current active name until that migration is complete)
- `mde-vercel`

Domain skills:
- `mde-real-estate` (rename to `real-estate` is planned)
- `events` and `stripe` must not be referenced until their canonical active skills exist.

Workflow skills:
- `using-mde-skills`
- `tasks`
- `systematic-debugging`
- `tdd`
- `testing`
- `code-review`
- `task-verifier`
- `research`
- `writing-skills`
- `wireframe`
- `mermaid-diagrams`

Retired: `mde-task-lifecycle`, `copilotkit-debug`, `copilotkit-integrations`, `copilotkit-setup`.

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
python3 .claude/skills/using-mde-skills/scripts/validate-skills.py
python3 .claude/skills/using-mde-skills/scripts/validate-vendor-skills.py
python3 .claude/skills/using-mde-skills/scripts/check-upstream-drift.py
git diff --check -- .claude/skills CLAUDE.md .claude/hooks/session-start.mjs
```

Structural eval definitions are specifications only until they are actually executed. Never report an eval as passing merely because its JSON validates.

## Response style

Lead with the answer. Keep explanations concise, concrete, and tied to MDE when useful. Always pair task numbers with task names.
