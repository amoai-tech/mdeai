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

The canonical CI is **`.github/workflows/momentic-rentals-preview.yml`** (advisory, exact READY preview verification, no reusable browser bypass credentials). It currently runs only `exact-bedroom-filter.test.yaml` for in-scope PRs. **Do not create a second mandatory CI release gate.** Expand selection after CLI execution is reliable.

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
