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
not skip to green. Playwright 1.61 may create `error-context.md` with page content
on a failed assertion even when trace/screenshot/video are off; treat local
`test-results/` and HTML reports as sensitive and never publish them from
authenticated runs. There is no supported `error-context: "off"` test option.

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


## SAN-677 — Real broker onboarding E2E (explicit, cleanup-verified)

`e2e/san-1092-broker-onboarding.spec.ts` creates a **real** Supabase Auth
identity, landlord profile and rental draft. The generic Playwright suite skips
this write-bearing case. Run it intentionally on an isolated Next.js port:

```bash
# Use ignored, real QA secrets and a known backend target (never commit them).
SMOKE_BASE_URL=http://localhost:3098 \
PLAYWRIGHT_WEB_SERVER_COMMAND='npx next dev --webpack -p 3098' \
ALLOW_PROD_CERTIFICATION=1 npm run test:e2e:broker-onboarding
```

The established `require-safe-e2e-backend.mjs` guard refuses a hosted Supabase
project without the explicit override. The test creates its own unique QA
identity, checks the saved broker/listing, deletes its own listings and profile,
then uses the existing `deleteThrowawayIdentity` helper. It verifies all rows
were removed, and fails (rather than falsely going green) on cleanup errors.
Never run this spec against an actual tenant account. Screenshots are disabled
by default; explicit `BROKER_E2E_CAPTURE_SCREENSHOTS=1` places them in ignored
Playwright test artifacts, not under tracked docs. Treat all browser artifacts
and error-context files as private and do not upload them publicly.
