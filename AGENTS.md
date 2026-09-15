# AGENTS.md — MDE AI

Repo root: `/home/sk/mdeai`

## Working rules

- Use the canonical project skills in `.claude/skills/`.
- For a simple task, use the directly relevant skill and avoid extra orchestration.
- For ambiguous or multi-system work, use `using-mde-skills` to classify S0-S4 and choose one primary owner.
- `tasks` owns substantial implementation orchestration.
- `systematic-debugging` owns diagnosis when the root cause is unknown.
- `testing` and `tdd` own verification and test-first implementation.
- `code-review` reviews an existing diff or PR.
- `task-verifier` independently challenges Done, merge, and production-readiness claims.
- Persist substantial SAN progress and handoff state in Linear.

## Canonical stack skills

`copilotkit` · `mastra` · `supabase` · `gemini` · `mde-maps` · `mde-vercel`

`mde-maps` will become `maps`; `mde-real-estate` will become `real-estate`. Do not reference future names until their active skill directories exist.

## Safety and evidence

- Verify installed code and current official vendor docs before relying on API memory.
- Do not invent APIs, model names, or migration behavior.
- Do not expose service-role or other secrets to client code.
- New Supabase tables require RLS and explicit authorization policies.
- Do not reset, clean, or discard unrelated working-tree changes.
- Do not mark work Done without current test/runtime evidence.
- Treat repository skills as trusted instructions: review skill changes before relying on them.

## Tool-specific glue

Keep tool-specific settings separate from the shared skill content:
- Claude Code: `CLAUDE.md`, `.claude/settings.json`, `.claude/agents/`
- Cursor: optional `.cursor/` rules only when needed
- OpenCode: optional `opencode.json` permissions/config only when needed
- Codex and other agents: use this `AGENTS.md` as the portable project bootstrap
## Core project invariants

- CopilotKit stays on package `1.55.2` and uses `/v2` imports only; do not mix v1 and v2 APIs.
- Production AI is Gemini-first; verify the current model/provider contract before changing models.
- Every Places API New call must use an explicit `X-Goog-FieldMask`.
- Every `<AdvancedMarker>` requires a `mapId` on its parent map.
- Every new Supabase table requires RLS plus explicit authorization policy coverage.
- Source/config changes require relevant localhost/runtime proof before a Done claim.
