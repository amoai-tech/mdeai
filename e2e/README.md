# mdeapp e2e — focused runs only

Do **not** use bare `npm run test:e2e` (219+ tests) when verifying a single vertical.
That suite includes maps, screens, mobile sheet, and grounding — failures there do not
implicate restaurant or CopilotKit budget work.

## P0 focused jobs (run separately, `--workers=1`)

| Script | Spec | Responsibility |
|--------|------|----------------|
| `npm run test:e2e:copilot-budget` | `copilotkit-request-budget.spec.ts` | Idle + **event** fast-path POST budget; storm canary |
| `npm run test:e2e:restaurant-fast-path` | `restaurant-card-fast-path.spec.ts` | Restaurant cards via `/api/restaurants/search` |
| `npm run test:e2e:concierge-run-error` | `concierge-run-error.spec.ts` | UX-016 error bridge |

**Precondition:** `npm run dev` (UI `:3001`, Mastra `:4111`). Restart dev
between budget runs if a prior session triggered a CopilotKit POST storm.

## Query ownership

| Query | Used in | Path |
|-------|---------|------|
| `salsa events this weekend` | request-budget only | Event fast path (`/api/events/search`) |
| `suggest restaurants medellin` | restaurant-fast-path only | Restaurant fast path (`/api/restaurants/search`) |
| `quiet rooftop dinner in Provenza` | **not in e2e** | Slow agent / grounded-places — Vitest only |

## Out of scope for restaurant / budget verification

- Maps billing (`BillingNotEnabledMapError`)
- Café grounding latency / silent UI
- `e2e/maps-*`, `e2e/screens/*`, `rich-card-dedup`
- Full `playwright test` without a path filter

## Heredoc anti-pattern

Do not run `npx playwright test - <<'EOF'` — Playwright ignores inline stdin and runs the
full discovered suite.

## SAN-1549 — one-command signed-in QA smoke

Run from the repository root (the TypeScript test is a file, **not** a Bash command):

```bash
npm ci
npx playwright install chromium
npm run test:e2e:qa-signin
```

This **opt-in** smoke uses `e2e/fixtures.ts` and `e2e/helpers/auth.ts` to obtain a
real Supabase email-OTP session for the existing read-only QA account (and
refuses auto-creating it if missing). No
manual password, inbox, global `storageState` setup project, or `E2E_BYPASS_AUTH`
is necessary. The script auto-starts the configured local Next.js server on
`:3001` (unless `PW_SKIP_WEBSERVER=1`); a legitimate authenticated `/saved`
response must be HTTP 200, show the user's saved content/empty state, and
never show the sign-in prompt.

**Secrets:** supply `NEXT_PUBLIC_SUPABASE_URL`, the publishable/anon key,
and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) through an
ignored `.env.local` or CI secret store. Never print, commit or upload these
secrets, Supabase session cookies, Playwright traces, storage-state JSON or
authenticated screenshots. On a clean worktree, provide the env locally
without committing it. Missing credentials must make this explicit smoke fail,
not skip to green.

**Negative path:** `npm run test:e2e:auth` runs the existing signed-out
guard suite independently; do not globally authenticate its contexts.
For deployed authenticated smoke use the existing `prod-smoke` test
`e2e/prod-signed-in-route.spec.ts` with `PROD_SMOKE_BASE_URL` and
`PW_SKIP_WEBSERVER=1`. Its origin-aware session helper is intentionally
different from this local-only smoke.

**Role/data-changing tests:** use distinct, real auth identities and the
existing cleanup helpers; this shared QA account is for read-only smoke.
Role/RLS and cross-user isolation proof belongs to the existing rental
and account-security test tasks, not this smoke command.

**Ubuntu 26.04:** Playwright v1.60 cannot download Chromium on this OS;
use the repository's updated Playwright lockfile and matching browser.
If a browser binary is missing, run `npx playwright install chromium`.
For debugging, run:
`npx playwright test e2e/signed-in.spec.ts --project=chromium --headed`.
