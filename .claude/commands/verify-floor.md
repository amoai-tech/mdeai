---
description: Pre-commit floor check — runs `npm run floor` plus an RLS evidence add-on
allowed-tools: Bash, Read, Grep
---

# /verify-floor — pre-commit floor

Run the floor before any commit or PR. `npm run floor` is the single source of truth for the gate chain (see `package.json`); this command runs it and adds one RLS evidence check on top. It is slow, so run it once per change, not after every edit.

## Workflow

From the repository root (or any worktree after `scripts/worktree-bootstrap.sh`):

```bash
npm run floor
```

A fresh worktree needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` exported for the env check; see `AGENTS.md` § Build and test commands. Do not paste the key into any tracked file.

If any migration file changed this session, also confirm RLS via the Supabase MCP (plugin) `execute_sql`:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname='public' AND tablename IN (<new tables this session>);
```

Print a two-row table (floor, RLS) and stop. Do not fix anything here; surface failures only.

```
| Check | Result |
|-------|--------|
| Floor | ✅     |
| RLS   | ✅     |
```

If any row is ❌, do NOT proceed to commit. Investigate the root cause. The Stop hook `stop-rls-gate` warns when a migration changed without RLS evidence.

## Run the floor as a `/goal`

`/goal` (Claude Code ≥ v2.1.139) keeps the session working until a separate evaluator model confirms a condition, removing the per-turn "is it done yet?" prompt the way Auto Mode removes the per-tool one. The floor fits: it has a measurable end state. The evaluator only reads the transcript — it can't run commands — so each condition below forces the gate results to be **printed** and pairs exit codes with a real journey signal, so a bare "exited 0" summary can't satisfy it.

Paste one (one goal per session; `/goal` checks status, `/goal clear` stops):

- **Floor only** —
  `/goal The floor is green: npm run lint, npm run typecheck, npm run build, npm test, and npm run audit each exit 0, with each command's exit status shown in the transcript. Do not modify any test, eslint config, tsconfig.json, or next.config to force a pass — fix the source. Stop after 15 turns and report if any gate is still red.`

- **Search / intelligence floor** (adds the golden-queries journey) —
  `/goal The floor is green (lint, typecheck, build, vitest, audit all exit 0 each shown in the transcript) AND npm run smoke:golden-queries passes with GQ-E01 "salsa this weekend" showing hybridUsed:true in its output. A green smoke exit code alone is insufficient — the hybridUsed:true line must appear. Do not edit tests, smoke scripts, or config to force a pass. Stop after 20 turns and report if not met.`

- **Ship one small PR** (no merge) —
  `/goal One small PR is open for the current change: the floor is green (each gate's result shown in the transcript), the work is a single fresh branch off latest main (not stacked), git status shows only the intended files, and gh pr view shows the PR open. Do not merge and do not force-push. Stop after 25 turns and report status if not met.`

A goal is only as honest as the evidence surfaced in the transcript — keep printing real command output, not summaries. A permanent project Stop hook is **not** recommended for the floor: it would re-fire on every turn of every session, whereas the floor only matters pre-commit.

### Best practices for `/goal` conditions

- **Binary, transcript-visible end state.** The evaluator can't run commands — it judges only what's printed. Write "`vitest run` exits 0 with the pass count shown," never "tests look fine."
- **Pair every exit code with a journey signal.** "Exited 0" ≠ "it works." Demand the proof line: GQ-E01 `hybridUsed:true`, a non-zero pin count, a `paid` ticket row — not just the return code.
- **Forbid the cheat explicitly.** The evaluator can't see that you weakened a gate, so spell it out: no `.skip`/`xfail`, no editing the test/smoke/config, no `next.config` `ignoreBuildErrors`. Fix the source instead.
- **Always bound the run.** End with "stop after N turns and report." Goals re-fire unattended and spend tokens; an unbounded red gate loops.
- **Fence irreversible/shared-state actions inside the condition.** "Do not merge, do not force-push, disposable DB only, no `vercel --prod`." A goal acts across turns without you — name what it must never touch.
- **One goal, one coherent end state.** One per session; don't bundle five unrelated gates. `/goal clear` and reset when scope shifts. It composes with Auto Mode so each turn runs hands-free.
- **Scope to the change, not the repo.** Narrow to what you touched (`e2e/restaurant*`, `src/mastra/lib/**`) — faster turns, cheaper, less flake. Read the evaluator's last reason via `/goal`; if it's misreading the transcript, tighten the wording rather than re-running.

## Anti-patterns

- Do not auto-fix ESLint/Prettier as part of this command — that's the PostToolUse hooks' job.
- Do not run Playwright here — use `/release-checklist` for E2E gates.
- Do not modify `next.config.ts` `ignoreBuildErrors` to make tsc pass.
