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


## Role-selected QA and private artifacts

Use the **same existing Supabase authentication helper**. A trusted agent declares the
role with `test.use({ qaRole: "..." })` and receives `qaRolePage`:

| Test intent | Selected existing identity |
| --- | --- |
| `anonymous` (default) | Signed out; independent browser context |
| `super-admin` | `mde@socialmediaville.ca` |
| `event-host` | `qa-landlord@mdeai.co` (existing host QA) |
| `renter` | Existing dedicated account from `MDE_QA_RENTER_EMAIL` |
| `broker` | Existing dedicated account from `MDE_QA_BROKER_EMAIL` |

Renter and broker accounts must already exist, be named `qa-*@mdeai.co`, and
have the intended **actual app role**. The fixture refuses a missing or
unconfigured identity; it never creates a user or silently substitutes Super Admin.
For authenticated tests, **explicitly disable screenshot, trace and video**:

```ts
import { test, expect } from "./fixtures";
test.use({ qaRole: "event-host", screenshot: "off", trace: "off", video: "off" });
test("host QA can open Saved", async ({ qaRolePage }) => {
  await qaRolePage.goto("/saved");
  await expect(qaRolePage.getByTestId("saved-page")).toBeVisible();
});
```

Read-only browser verification with the configured existing accounts:

```bash
MDE_ROLE_QA_E2E=1 PW_SKIP_WEBSERVER=1 SMOKE_BASE_URL=https://www.mdeai.co \
  npm run test:e2e:qa-roles
```

The fixture marks authenticated tests' private output directories. Before generic
Playwright artifacts are uploaded, CI calls
`scripts/sanitize-playwright-qa-artifacts.mjs`: on detecting **any** private
session marker it removes all `test-results/`, HTML reports, and blob reports
for that job. The loss of diagnostic artifacts is intentional: never publish
tokens, cookies, protected DOM snapshots or test identities in GitHub Actions.
No authenticated `test-results/` or `tmp/playwright-report/` should be
uploaded through any alternate workflow. Do not share local reports either.

**Canonical real rental journey — reuse SAN-1205, do not invent a second one.**
`e2e/rental-conversion-journey.spec.ts` proves the real viewing form →
exactly one persisted lead + showing → correct broker screen and isolation →
idempotent replay → cleanup and zero residue. It uses its own controlled
throwaway renter/brokers, *not* permanent Super Admin. It is a real Supabase
write test and must be run only with explicit opt-in and authorized test cleanup:

```bash
SAN1205_JOURNEY_E2E=1 SAN1205_ALLOW_PRODUCTION_WRITES=1 \
  PROD_SMOKE_BASE_URL=https://www.mdeai.co npm run test:e2e:rental-viewing
```

**Do not use the write command as a routine production smoke.** Check the
current worktree, environment and persisted cleanup preconditions first; keep
normal production checks read-only. A green local result is never a deployment
receipt. Separate role permissions must still be proven by each journey.

## Shared Super Admin QA fixture

Import `test` from `e2e/fixtures.ts`, disable screenshot/trace/video recording
with `test.use`, and request `superAdminPage` **only** in tests requiring admin
access. The fixture fails closed if recording is enabled, *before* generating a
Super Admin session. It calls
`signInAsOnOrigin()` for the existing `mde@socialmediaville.ca` identity; no password, fake login, new user or
global auth setup is needed. Other tests remain signed out.

```ts
import { expect, test } from "./fixtures";

test.use({ screenshot: "off", trace: "off", video: "off" });
test("admin can manage rental test listings", async ({ superAdminPage }) => {
  await superAdminPage.goto("/admin/rentals");
  await expect(superAdminPage.getByTestId("admin-rental-table")).toBeVisible();
});
```

Run the **read-only** fixture proof from the repo root using ignored `.env.local`
or trusted CI secrets (both commands intentionally opt in):

```bash
MDE_SUPER_ADMIN_QA=1 PW_SKIP_WEBSERVER=1 SMOKE_BASE_URL=http://localhost:3001 \
  npx playwright test e2e/qa-super-admin-fixture.spec.ts --project=chromium --workers=1

MDE_SUPER_ADMIN_QA=1 PW_SKIP_WEBSERVER=1 SMOKE_BASE_URL=https://www.mdeai.co \
  npx playwright test e2e/qa-super-admin-fixture.spec.ts --project=chromium --workers=1
```

Playwright 1.61 defines `screenshot`, `trace` and `video` as injectable
worker-scoped option fixtures. The safe/unsafe regression in
`e2e/qa-playwright-artifact-options*.spec.ts` verifies the resolved values and
the guard without signing into any account:

```bash
PW_SKIP_WEBSERVER=1 npx playwright test e2e/qa-playwright-artifact-options \
  --project=chromium --workers=1 --retries=0
```

For debugging that needs screenshots, choose a non-admin synthetic identity in
an isolated local run, not the privileged QA fixture. Do not upload those
artifacts into ordinary CI reports.

The existing Supabase helpers reject absent permanent QA accounts and never put
privileged credentials in browser code. A consumer that omits
`test.use({ screenshot: "off", trace: "off", video: "off" })` fails before login. Playwright may still create
`error-context.md` on failure, so never publish authenticated `test-results/` or
HTML reports even when recordings are disabled. Keep these runs **read-only by
default**, and do not publish cookies, traces, screenshots or local error-context
artifacts. For write tests, require an explicit task-specific opt-in, synthetic
fixtures and verified cleanup; use separate identities for renter/broker and
cross-user denial tests. A passing local test never proves production deployment.

## SAN-1193 — source-grounded live partner-signup smoke (opt-in)

**Canonical issue:** [SAN-1193 · MDE Partner Signup — Autofill Business Details From a Website](https://linear.app/amo100/issue/SAN-1193). **Merged feature:** [PR #404](https://github.com/amoai-tech/mdeai/pull/404).

**SAN-1602 provider migration (this PR, not yet deployed):** Partner and Restaurant website
imports now use `src/lib/web/safe-public-page-reader.ts` with guarded-fetch for public
HTML, then `src/lib/web/extract-website-json.ts` using the existing selected AI
provider. Set server-side `MDE_AI_PROVIDER=nvidia` with `NVIDIA_API_KEY` to verify
Nemotron 3.5 Lightning. Neither the model nor CopilotKit crawls URLs: only the
server-observed final response URL is accepted as provenance. Both proposals remain
read-only until the operator explicitly saves via the existing Supabase routes.
Do not run the production smoke against an old SHA or claim deployment before merge.
The fast deterministic regression `e2e/app/partner-ai-signup-persistence.spec.ts` continues to mock just the extraction response, while testing real browser/Auth/partner writes.

`e2e/app/partner-ai-signup-live-source.spec.ts` is **opt-in**. It requires authenticated real Supabase credentials, performs a real external source analysis via MDE's deployed API, checks a retrieved website source, uses the actual edit/review UI, persists the final edited fields, verifies DB readback and one partner/member, checks 390px, and cleans up. It must not run in ordinary PR CI because it uses a paid live provider and shared DB. If retrieval fails, the test fails; no fabricated source or skipped-to-green run.

### Exact deployed test procedure

1. Read the production deployment's `githubCommitSha` and compare its deployment ID with the `www.mdeai.co` Vercel domain alias. Do not infer deployed SHA from a merged PR or HTTP 200. [Vercel inspect reference](https://vercel.com/docs/cli/inspect) — REFERENCE ONLY → use the existing Vercel project/alias verification.
2. Supply ignored E2E-only Supabase URL, publishable/anon key and service-role test credential locally. Never place service-role keys in client code or CI artifacts. Avoid committing authenticated screenshots, traces, browser storage state, real account emails or tokens.
3. Explicitly run the real-source journey:

```bash
MDE_PARTNER_LIVE_SOURCE_E2E=1 PW_SKIP_WEBSERVER=1 \
  SMOKE_BASE_URL=https://www.mdeai.co \
  npx playwright test e2e/app/partner-ai-signup-live-source.spec.ts \
    --project=chromium --workers=1
```

4. Verify **1 passed, 0 failed, 0 skipped** plus `SAN1193_LIVE_PASS` and `SAN1193_LIVE_CLEANUP_VERIFIED`. Confirm test identities and any synthetic partner rows were removed. Failed tests require cleanup investigation before another run; no automatic paid-provider retries.
5. Recheck Vercel alias/current deployed SHA and endpoint runtime errors. This Phase A exercise is not public-launch certification.

### Restaurant owner NVIDIA live-source journey (opt-in)

Run with the matching PR code served locally using `MDE_AI_PROVIDER=nvidia`:

```bash
MDE_RESTAURANT_LIVE_SOURCE_E2E=1 PW_SKIP_WEBSERVER=1 \
  SMOKE_BASE_URL=http://localhost:3146 \
  npx playwright test e2e/app/restaurant-owner-workspace.spec.ts \
    --project=chromium --grep 'SAN-1602 live NVIDIA' --workers=1
```

The test uses a real authorized restaurant fixture in Supabase: fetched public
page → actual NVIDIA extraction → no write before review → operator edits
and Saves → exact persisted restaurant on refresh → unrelated partner 403 →
verified synthetic-data cleanup. It is intentionally skipped unless opted in.
Never describe a skipped test as proof or infer the importer provider from a
Mastra Concierge `ai_runs` row; use the actual website-import server model trace.

**References:** [guarded-fetch](https://github.com/vercel-labs/guarded-fetch)
(ADAPT secure read to `src/lib/web/safe-public-page-reader.ts`),
[AI SDK structured output](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
(ADAPT installed `ai@6` Output.json in `src/lib/web/extract-website-json.ts`),
[NVIDIA Lightning inference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b-infer)
(REFERENCE ONLY — existing MDE adapter performs the inference).
