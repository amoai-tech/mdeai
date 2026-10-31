# MDE Rentals — Momentic QA

Momentic v2 YAML tests complement, **not replace**, MDE's existing Playwright integration/E2E and Supabase verification. This directory is a read-only **initial layer** of the broader Rentals journey; it is not an end-to-end viewing-booking certification.

## Scope and current proof

| User role | Route | Coverage owner | Current Momentic status |
| --- | --- | --- | --- |
| Renter (guest) | `/`, `/rentals` | Existing `exact-bedroom-filter.test.yaml` | Existing pilot; first real CLI run not yet proven complete |
| Renter (guest) | `/rentals?neighborhood=Laureles&beds=2` → in-page Details panel/sheet | `search-to-details.test.yaml` | **PASS on production**, `/rentals/[id]` is a separate direct route |
| Renter (guest) | Rentals card → Schedule viewing or MDE follow-up form | `viewing-form-no-submit.test.yaml` | **PASS on production**; **never submits** |
| Renter (guest) | `/app/me/saved` → login return | `renter-saved-guest-redirect.test.yaml` | **PASS on production** |
| Broker (guest) | `/app/rentals` → login return | `broker-guest-redirect.test.yaml` | **PASS on production** |
| Renter (authenticated) | `/app`, `/app/me`, `/app/me/saved`, `/saved` | Existing Playwright signed-in/production journeys | Not a Momentic auth test |
| Broker / landlord (authenticated) | `/app/rentals`, `/app/rentals/listings`, `/app/rentals/onboarding` | Existing broker Playwright tests | Not a Momentic auth test |
| Legacy broker (authenticated) | `/host/rentals`, `/host/rentals/dashboard`, `/host/rentals/listings`, `/host/rentals/onboarding` | Existing broker Playwright tests | Legacy aliases; verify current behavior before asserting |
| Super Admin | `/admin/rentals` | Authenticated admin + database tests | Not a Momentic admin test |
| AI Concierge | `/chat`, Rentals inline Ask MDE | Existing production AI/rental Playwright test | Not a Momentic agent test |
| Partner marketing | `/partners/rentals` | Route discovery | Not tested |

**Do not mark unchecked rows PASS.** Momentic CLI v3.67.1 lint passed and the four new read-only tests passed against `https://www.mdeai.co` on source revision `5902ea82ab965262304181a9e7c48b0fc3a3badf` (4/4, 97s). [Uploaded Momentic evidence](https://app.momentic.ai/run-groups/8eac9ddb-41a5-4df2-80e2-0654f37c1f12). The existing exact-bedroom pilot and other authenticated/DB flows were **not** included in that four-test run.

## Use the installed tools

From the MDE repository (or a clean worktree with its own `npm ci`):

```bash
npx --no-install momentic whoami
npx --no-install momentic doctor
npx --no-install momentic lint
npx --no-install momentic run momentic/rentals/exact-bedroom-filter.test.yaml --retries 0 --yes
npx --no-install momentic run momentic/rentals/search-to-details.test.yaml --retries 0 --yes
qa version
```

Use `--url-override` for an **exact trusted staged URL**, retaining the test's expected start route. Existing tests intentionally pin public URLs; setting `--env` alone does not change a test's explicit `url` (see Momentic's environment precedence). Never point a write-enabled test at production casually.

The canonical CI is **`.github/workflows/momentic-rentals-preview.yml`** (advisory, exact READY preview verification, no reusable browser bypass credentials). Once this PR merges, its **trusted main-branch** workflow runs all five signed-out Rentals Momentic specs. Each test gets the verified preview **origin plus its own original path/query** from `scripts/momentic-rentals-preview-url.mjs` (six negative/positive URL-contract tests). A protected preview without public access remains **BLOCKED**, not a false green; the privileged workflow never checks out untrusted PR source. New tests cannot run in that privileged workflow **before they reach main**. Retain existing Playwright for the required security/transaction gates; do not create a second mandatory CI release gate.

## Backend and user-journey proof — reuse the existing system

Browser tests cannot prove saved database transactions. The full path is:

`search → real card/map → Details → Schedule Viewing → Next.js /api/leads/schedule-viewing → Supabase Edge chat-lead-capture → atomic persisted lead + showing → correct broker dashboard → renter read-back`

Reuse:
- `e2e/screens/REAL-011-rentals-browse.spec.ts`, `e2e/screens/SCREEN-008-schedule-viewing.spec.ts`
- `e2e/san-1092-broker-onboarding.spec.ts`
- `e2e/san-1204-broker-viewing-requests.spec.ts`, `e2e/san-1206-broker-viewing-actions.spec.ts`
- `e2e/prod-rentals-results-refresh.spec.ts`
- `src/app/api/leads/schedule-viewing/route.ts`, `src/app/api/host/rentals/viewings/[id]/route.ts`
- `e2e/helpers/auth.ts` / `signInAsOnOrigin()` for the existing QA users

For the **data-changing opt-in** journey: use only owned, labeled QA listings and the pre-existing trusted Playwright/Supabase authentication helpers. Prove exactly one lead and showing on retry, correct broker, cross-broker denial, persisted status, and cleanup by authorized DB read-back. No test should generate a permanent QA user or disclose service keys/cookies. Do not impose business-approval gates during prelaunch.

Do not assert that a `/saved` item is a persisted viewing request. Record each missing renter status/surface as a verified gap rather than inventing a page.

## Mobile, dashboard, and AI follow-through

Continue to use real 390px Playwright screenshot/overflow tests for the mobile baseline while Momentic's mobile viewport setup is verified. For Ask MDE, check grounded rental cards, map pin correspondence, 2BR/budget constraints, chat persistence, and authorized action outcome; do not assert exact AI wording or fictional prices/availability. For broker dashboard, check persisted viewings and RLS isolation with two distinct QA brokers. For admin, check server-authorized management actions and audit trails without requiring business paperwork.

## Known local execution issue

The CLI's `whoami`, HTTPS API authentication, Chrome/Chromium detection, and project `lint` passed on the operator's Ubuntu system. Earlier, `momentic doctor` reported a **WebSocket connectivity warning**, but **actual Momentic browser execution now succeeded on all four new tests**. Investigate the diagnostic separately if it recurs; it did not block this recorded run. The existing exact-bedroom pilot is **not** part of the four-test evidence. Do not claim full rental booking/database coverage from read-only browser tests.

Official docs: https://momentic.ai/docs/llms.txt · https://momentic.ai/docs/core-concepts/file-format · https://momentic.ai/docs/running-tests/ci/github-actions · https://momentic.ai/docs/mo/brief

Mo is separate from YAML Momentic tests; choose explicit effort and permitted test data before starting a billable hosted `qa start` session.

## Reproducible QA listings and real booking evidence

The browser-only Momentic cases inspect **real currently public inventory**; they deliberately do not create test accounts or apartment listings. An unavailable 2BR/3BR comparison is **a blocked test precondition, never PASS**. Production inventory can change. The **authoritative, predictable fixture** for the transaction journey is already `e2e/helpers/rental-journey-fixture.ts`, used by `e2e/rental-conversion-journey.spec.ts`: uniquely labeled `SAN1205` QA listing with owned broker and unrelated broker; it creates and deletes only its own rows and verifies no residue. Do not invent permanent production QA listings or create another fixture service just to make browser-only assertions green.

Real-world evidence: SAN-1205 opt-in existing Playwright journey passed **1/1 in 28.1 seconds** on production deployed `40de33c7fb7e254981ce62f7983b205cdaed35d1`, covering actual UI → API → one persisted lead/showing → retry/refusal paths → broker/other-broker/390px view → DB-confirmed cleanup. This is not Momentic coverage and does not certify later releases. To repeat on an authorized environment with local/CI secrets already configured:

```bash
SAN1205_JOURNEY_E2E=1 SAN1205_ALLOW_PRODUCTION_WRITES=1 \
  PROD_SMOKE_BASE_URL=https://www.mdeai.co PW_SKIP_WEBSERVER=1 \
  npx playwright test e2e/rental-conversion-journey.spec.ts --project=prod-smoke --workers=1 --retries=0
```

**Mobile/AI tests (read-only UI):** `e2e/prod-rentals-mobile-form-map.spec.ts` validates 390px controls, genuine map marker IDs after async load, and opening/closing the real form without Submit; `e2e/prod-rentals-results-refresh.spec.ts` validates authenticated Ask MDE filtering, saved results/transcript, card/pin IDs, and opening the selected AI result in Details. Run these with explicit `PROD_SMOKE_BASE_URL` and `PW_SKIP_WEBSERVER=1`; the AI test reuses the existing temporary Supabase auth helper. The static tests are not substitutes for the SAN-1205 DB test.

## Verification caveat for the live AI follow-up

The opt-in authenticated production Ask MDE suite has an added assertion that a returned AI apartment card opens the **same** Details/selected map pin. On the October 31 live recheck, the existing two-turn AI flow did not advance to the second COP-budget response within 110 seconds, so the new Details assertion was **not reached**. Do not label that production AI flow PASS. Vercel recently reported a Gemini function-call turn-order error on a CopilotKit route, but whether it caused this specific failure remains unknown. Investigate the canonical agent/runtime separately; never change the test expectation to mask a stale answer. The deterministic chat rental Details test has additionally been tightened to compare the map pin and listing identity.

The new real production 390px renter form/map smoke passed **2/2** after adjusting for asynchronous Google Maps marker loading (three mapped card IDs matched three real markers). The full codebase `npm run floor` passed with **4,352 tests passed, 51 skipped**, and the release-gate set passed **719, 4 skipped** in the isolated worktree. CI still needs to complete on the **pushed head**, and the existing advisory Momentic workflow will not begin running five trusted tests until these files merge to main.
