# .claude — Claude Code workspace for MDE AI

Shared Claude Code configuration for this repository. `AGENTS.md` (repo root) is the canonical
guidance; this folder holds the machinery that enforces and supports it.

## Layout

```
.claude/
├── settings.json          Committed. Hooks, permissions (ask / allow / deny), output style.
├── settings.local.json    Gitignored. Personal permission additions.
├── hooks/                 Edit-time and Stop guardrails (table below). lib/repo-path.mjs is the shared path helper.
├── skills/                Canonical skill library. INDEX.md is the authoritative list.
├── agents/                Subagents: mdeai-auto-reviewer, pr-scope-reviewer, security-reviewer.
├── commands/              Slash commands: /verify-floor, /auto-review, /copilotkit-check, /supabase-rls-audit.
├── rules/                 Path-scoped rules, loaded only when matching files are touched.
├── output-styles/         mdeai-plain (the reply style).
├── auto-review/           Rules for the mdeai-auto-reviewer subagent.
└── launch.json            Dev-server configurations for the in-app preview.
```

`.agents/skills/` mirrors every canonical skill as relative symlinks so other agents resolve the same
files. `npm run check:skills` fails on a copy, an absolute link, or a missing entry.

## Hooks

| Event | Hook | Does |
|---|---|---|
| SessionStart | `session-start.mjs` | Prints repo, branch, recent commits, skill scan. |
| PreToolUse (edit) | `guard-sensitive-paths.mjs` | Blocks `.env*` writes, `supabase/migrations/**` edits, and the frozen legacy tree. |
| | `scan-secrets.mjs` | Blocks secret-shaped literals. |
| | `no-service-role-in-src.mjs` | Blocks service-role references under `src/` (carve-outs: `src/mastra/lib`, `src/lib/supabase/service*.ts`, tests). |
| | `gemini-model-pin.mjs` | Blocks retired Gemini model IDs and OpenAI/Anthropic SDKs in `src/` and `supabase/functions/`. |
| | `copilotkit-version-pin.mjs` | Keeps `@copilotkit/react-core` and `runtime` exact, aligned and at the certified version; blocks the full-rewrite package line. |
| | `places-api-field-mask.mjs` | Blocks Places API (New) calls without `X-Goog-FieldMask`. |
| | `advanced-marker-needs-mapid.mjs` | Blocks `<AdvancedMarker>` on a `<Map>` with no `mapId`. |
| PreToolUse (Bash) | `dist-leak-scan.mjs` | Before a deploy-shaped command, scans build output for secrets. |
| PostToolUse (edit) | `lint-edited-ts.mjs` | Warn-only ESLint on the edited file. |
| Stop | `stop-rls-gate.mjs` | Warns when a migration changed with no RLS evidence. |
| | `stop-plain-language-gate.mjs` | Blocks a final reply that names a task ID without its name; warns on arrow chains. |
| | `stop-typecheck.mjs` | Whole-project `tsc` once per set of TypeScript edits; blocks the stop once if changed files have errors. |

`hooks/_deferred/` holds hooks that are written but not registered.

### Keeping hooks honest

A hook that matches nothing exits 0, so a broken path check looks exactly like a passing one.
`scripts/__tests__/claude-hooks.test.mjs` (run by `npm run check:release-gates`, so by `floor`)
feeds every guard a bad edit inside a throwaway repo with an unrelated name and expects a block. It
also fails if a hook hard-codes a machine path or the retired `mdeapp/` folder. When you add a hook,
add its case there. Resolve paths with `hooks/lib/repo-path.mjs`, never a literal path.

## Related

- `scripts/worktree-bootstrap.sh` makes a fresh git worktree runnable (clean install, shared env files).
- Linear is the durable task source of truth. Skills own detailed workflows; `AGENTS.md` owns repo-wide invariants.
