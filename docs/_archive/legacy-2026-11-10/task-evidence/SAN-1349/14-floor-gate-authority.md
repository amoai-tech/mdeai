SAN-1349 · authoritative Floor gate interpretation
Head: 2af35476b9ca0ce1dea8ed9f571decbd3a9d136b
Generated: 2026-09-27T20:35:40Z

## check:skills — LOCAL WORKSPACE STATE, not a PR gate failure

The ten reported .agents/skills entries are UNTRACKED local files dated 2026-09-21..23.
git status --porcelain .agents/skills/ :
?? .agents/skills/build-integration/
?? .agents/skills/configure-site/
?? .agents/skills/cr-create/
?? .agents/skills/cr-review/
?? .agents/skills/supabase-postgres-best-practices/
?? .agents/skills/supabase/CHANGELOG.md
?? .agents/skills/supabase/assets/
?? .agents/skills/supabase/references/
?? .agents/skills/write-docs/
?? .agents/skills/write-openapi/

git log (empty = never committed) for .agents/skills/build-integration:
(no output above = never committed)

## clean-checkout result (tracked files only, HEAD)
worktree: /tmp/san1349-clean-checkout (detached at 2af35476b)
tracked .agents entries in that tree: 21
offending paths present in that tree: 0
--- python3 scripts/check-skill-layout.py ---
SKILL_LAYOUT_PASS active=21
check:skills exit=0

## check:env:ci — TWO DISTINCT INVOCATIONS (labelled)

Invocation 1 — ambient shell only (no .env exported). Recorded in 08-floor-remaining-gates.txt.
  command: npm run check:env:ci
  result : exit 1
  reason : 'env-contract: FAIL — 2 required variable(s) missing:
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'
  note   : both variables ARE present with values in .env; they are simply not exported
            into this shell, while NEXT_PUBLIC_SUPABASE_URL happens to be.

Invocation 2 — identical command with .env sourced (set -a; . ./.env; set +a).
  command: ( set -a; . ./.env; set +a; npm run check:env:ci )
  result : exit 0
  output : 'env-contract: OK'

Invocation 2 is authoritative: the gate inspects process environment, and no file in this
PR touches environment, next.config, or any script. Diff scope is 13 modified + 4 added
files, none of them env-related.

## Other Floor gates on this head

| gate | result |
|---|---|
| check:db-url-guard | exit 0 |
| lint | exit 0 (0 warnings) |
| typecheck | exit 0 |
| build | exit 0 |
| test | exit 0 — 272 files, 1655 tests passed |
| check:mastra | exit 0 |
| audit:floor | exit 0 |

## Playwright

Both deterministic rental journeys fail with 'HTTP 401 unauthorized' from the CopilotKit
runtime at chat boot, before any rental code runs. Proven pre-existing in
10-playwright-baseline-probe.txt: the UNMODIFIED HEAD version of deterministic-critical.spec.ts
fails identically. CI runs these jobs with real secrets; see the PR checks tab.
