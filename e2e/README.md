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


## SAN-1193 — live Gemini + deployed partner-signup smoke (opt-in)

**Canonical owner:** [SAN-1193 · MDE Partner Signup — Autofill Business Details From a Website](https://linear.app/amo100/issue/SAN-1193).
**Merged implementation:** [PR #404](https://github.com/amoai-tech/mdeai/pull/404).
**Live UI:** https://www.mdeai.co/partners/signup?type=venue.

The fast, deterministic regression remains `e2e/app/partner-ai-signup-persistence.spec.ts`: it mocks **only** URL extraction and proves real Auth, review, database persistence, concurrent saves, duplicate prevention, mobile and cleanup.

`e2e/app/partner-ai-signup-live-gemini.spec.ts` is a **separate explicitly opt-in**, real-Gemini Playwright journey: signed-out extraction denied → throwaway authenticated partner → live website URL Context result with a retrieved source → edit the existing review card → actual activation → Supabase readback → page refresh/readback → one partner/member → mobile overflow check → exact fixture cleanup. It calls the real paid Gemini endpoint and shared Supabase project; never run this in the default PR suite or with fake credentials. An extraction failure is a **failed smoke**, never a silent skip or a mocked success.

### Run on the deployed website

1. Inspect the intended Vercel **production deployment** and its `githubCommitSha`, and verify that the **www.mdeai.co domain alias points to that same deployment ID**. Do not infer deployed SHA from GitHub merge status or from HTTP 200. Use the connected Vercel deployment/alias tools or [Vercel CLI inspect](https://vercel.com/docs/cli/inspect).
2. Provide local ignored environment values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or anon key) and `SUPABASE_SERVICE_ROLE_KEY` **only to the test process**; do not export the service key into client code, browser context, GitHub artifacts, or screenshots.
3. Start the focused live smoke **only when intentional**:

```bash
MDE_PARTNER_LIVE_GEMINI_E2E=1 PW_SKIP_WEBSERVER=1 \
  SMOKE_BASE_URL=https://www.mdeai.co \
  npx playwright test e2e/app/partner-ai-signup-live-gemini.spec.ts \
    --project=chromium --workers=1
```

4. Read the `SAN1193_LIVE_PASS` and `SAN1193_LIVE_CLEANUP_VERIFIED` evidence in terminal output and confirm **1 test passed, zero failures**. Do not upload authenticated screenshots, storage state, traces, or test identities. The test itself does not capture any screenshots. If the test fails, inspect the failure and cleanup independently before retrying.
5. Recheck deployed SHA/alias and key API runtime errors after the smoke; compare with step 1. **Production-path verification is not public-launch authorization**.

### Local Gemini HTTP 402: billing, not a code/retry fix

A past local URL Context call returned HTTP **402** while the production request succeeded with **200**. Google defines 402 `payment_required` as a **depleted prepaid credit balance**. Verify the billing account and credits associated with the **local** API key in [Google AI Studio](https://aistudio.google.com/) and follow [official Gemini billing](https://ai.google.dev/gemini-api/docs/billing) and [API error codes](https://ai.google.dev/gemini-api/docs/api-errors). Compare project IDs or key fingerprints only through your provider dashboard; **never print, paste, or commit API keys**. Add eligible credits or configure a separate already authorized development key. Do **not** rotate/overwrite the functioning production key or retry 402 requests; retries apply to transient 429/5xx errors, not payment failures. The manual signup form remains the fallback when URL extraction is unavailable. Do not infer business verification from imported website data.

**No new agent/database architecture is required:** existing Next.js + CopilotKit v2 / Mastra + Supabase partner activation and RLS are canonical. OpenMuse/OpenDots are UX reference patterns; OpenBot is not involved. `pgvector` and Maps are unrelated to website extraction.
