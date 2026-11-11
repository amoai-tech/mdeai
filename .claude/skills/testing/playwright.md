---
name: webapp-testing
description: MDE TypeScript Playwright testing for local browser, QA login, mobile and explicitly authorized production smoke.
---

# MDE Playwright — one TypeScript runner

Use the repository's existing `@playwright/test`, `playwright.config.ts`, `e2e/fixtures.ts`, and `e2e/helpers/` code. Do **not** create Python Playwright scripts, add a second browser test harness, or introduce a new GitHub Marketplace Action.

## Choose the smallest test

- **Unit / API contract:** `npm test -- --run <path>` (Vitest) or `node --test scripts/__tests__/<file>.test.mjs` (Node).
- **Local browser:** `npm run test:e2e`; the script supplies a local server command and local URL. For a targeted spec, run `npx playwright test e2e/<name>.spec.ts --project=chromium --workers=1` with the intended local server running or configured.
- **Deterministic UI:** `npm run test:e2e:deterministic`. It uses the existing `local-chromium` project and appropriate mocked adapter; this is not live database/payment proof.
- **Mobile UI:** `npm run test:e2e:mobile-composer` or a focused mobile spec; verify 390px viewport and keyboard behavior.
- **Signed-in QA:** `npm run test:e2e:qa-signin`. Follow `e2e/README.md` for account configuration in ignored files. Do not commit credentials or storage-state screenshots.
- **Explicit live smoke:** use only existing `test:e2e:prod-*` scripts / `--project=prod-smoke`, with both `PROD_SMOKE_BASE_URL` and `PW_SKIP_WEBSERVER=1`. Never use a remote `SMOKE_BASE_URL` for ordinary tests.

## Browser/server setup

```bash
npm ci
npx playwright install chromium          # add firefox/webkit only if the test needs them
npx playwright test --list --project=local-chromium
npx playwright test --ui --project=local-chromium
```

The existing Playwright config starts and stops the local dev server when enabled. Use `npm run test:e2e` for its canonical server settings; avoid starting another app/server for the same test. `SMOKE_BASE_URL` is **local loopback only** (localhost, 127.0.0.1, [::1]) to prevent accidental database writes against remote targets. `PROD_SMOKE_BASE_URL` does not redirect local Chromium.

## Reliable assertions (web-first, no fixed sleeps)

```ts
import { test, expect } from "@playwright/test";

test("rentals route is available", async ({ page }) => {
  await page.goto("/rentals");
  await expect(page).toHaveURL(/\/rentals(?:\?|$)/);
  // Extend with a real listing selector from e2e/helpers for detail proof.
});
```

Use `getByRole`, `getByLabel`, `getByTestId` and retrying `await expect(...)` assertions; don't use `waitForTimeout` or blanket `networkidle` as readiness. Wait for a **specific UI state, API response, navigation or persisted read-back** instead.

## Real user-journey proof

- **Rentals:** search → grounded cards/map → Details → viewing → exactly one lead/showing and correct broker; exercise retry and cross-user denial.
- **Events:** Host AI review and publish → Stripe TEST Checkout → signed webhook → one wallet ticket; verify replay/decline and fixture cleanup.
- **Concierge:** grounded CopilotKit/Mastra result → authorized tool action → Supabase persistence and refresh; do not treat HTTP 200 as success.
- Keep test fixtures run-owned, visibly synthetic, and cleaned up in `finally` plus interrupted-run recovery. Never enforce Phase B owner/partner/listing approvals during Phase A development; retain auth, RLS and idempotency.

## Debug and verify

```bash
npx playwright test e2e/<name>.spec.ts --project=local-chromium --workers=1
npx playwright show-report tmp/playwright-report
node --test scripts/__tests__/playwright-local-safety.test.mjs scripts/__tests__/playwright-sharded-ci-contract.test.mjs
npm run lint
npm run typecheck
```

Inspect trace, browser console and relevant network responses; capture sanitized failure screenshots only. A green mock test is not live E2E proof. Before merging run the full applicable repo gate (`npm run floor`) and check the exact PR HEAD CI result.

## Official references

- https://playwright.dev/docs/best-practices — locators, web-first assertions, isolation
- https://playwright.dev/docs/test-webserver — local server lifecycle and base URL
- https://playwright.dev/docs/ci — browser install and reproducible CI
- https://playwright.dev/docs/trace-viewer — diagnose failed browser actions
