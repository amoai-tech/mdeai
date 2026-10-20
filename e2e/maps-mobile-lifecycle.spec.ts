import { test, expect, type Page } from "@playwright/test";

/**
 * SAN-1564 — real Google Maps lifecycle regression for the mobile chat map.
 *
 * This spec deliberately does NOT use NEXT_PUBLIC_E2E_MOCK_MAPS. It opens the
 * real sheet and the real Maps JavaScript API on production (prod-smoke), and
 * fails on any uncaught pageerror or unhandled rejection.
 *
 * Run:
 *   PW_SKIP_WEBSERVER=1 PROD_SMOKE_BASE_URL=https://www.mdeai.co \
 *   npx playwright test e2e/maps-mobile-lifecycle.spec.ts --project=prod-smoke --workers=1
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const BASE = process.env.PROD_SMOKE_BASE_URL?.trim() || "https://www.mdeai.co";

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push((error.stack ?? error.message).split("\n").slice(0, 4).join(" | "));
  });
  return errors;
}

async function installRejectionCapture(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __mapUnhandled: string[] }).__mapUnhandled = [];
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason as { stack?: string } | undefined;
      (window as unknown as { __mapUnhandled: string[] }).__mapUnhandled.push(
        String(reason?.stack ?? reason ?? "unhandled rejection"),
      );
    });
  });
}

async function assertNoPageErrors(page: Page, errors: string[], label: string) {
  const unhandled = await page.evaluate(
    () => (window as unknown as { __mapUnhandled?: string[] }).__mapUnhandled ?? [],
  );
  expect(
    [...errors, ...unhandled],
    `${label}: uncaught page errors / rejections`,
  ).toEqual([]);
}

async function gotoChat(page: Page) {
  const response = await page.goto(`${BASE}/chat`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  expect(response?.ok(), `GET /chat -> ${response?.status()}`).toBeTruthy();
  await expect(page.getByTestId("copilot-chat-textarea")).toBeVisible({
    timeout: 30_000,
  });
  // The trigger paints before React hydrates; `openSheet` retries the click.
  await expect(page.getByTestId("map-sheet-trigger")).toBeVisible({
    timeout: 10_000,
  });
}

async function openSheet(page: Page) {
  const trigger = page.getByTestId("map-sheet-trigger");
  for (let attempt = 0; attempt < 3; attempt++) {
    await trigger.click();
    try {
      await expect(page.getByTestId("map-sheet-content")).toBeVisible({
        timeout: 4_000,
      });
      break;
    } catch (error) {
      if (attempt === 2) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`map sheet did not open after 3 attempts: ${detail}`, {
          cause: error,
        });
      }
    }
  }
  const sheet = page.getByTestId("map-sheet-content");
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  return sheet;
}

async function expectRealMap(sheet: ReturnType<Page["getByTestId"]>) {
  await expect(sheet.locator(".gm-style").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(sheet.locator(".gm-style")).toHaveCount(1);
}

async function closeMap(page: Page) {
  const sheet = page.getByTestId("map-sheet-content");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden({ timeout: 10_000 });
}

async function searchCafes(page: Page) {
  await page
    .getByTestId("copilot-chat-textarea")
    .fill("Find cafés in Laureles, Medellín.");
  await page.getByTestId("copilot-send-button").click();
  await expect(
    page.locator('[data-testid="grounded-card"][data-result-kind="cafe"]').first(),
  ).toBeVisible({ timeout: 120_000 });
  // Cards render before the map context has the grounded coordinates. Wait for
  // a non-zero trigger count; the live café result set and marker clustering are
  // data-dependent, so the test must not hardcode 3.
  const trigger = page.getByTestId("map-sheet-trigger");
  await expect(trigger).toHaveAttribute("aria-label", /Open map with \d+ pins?/, {
    timeout: 120_000,
  });
  return Number(
    (await trigger.getAttribute("aria-label"))?.match(/with (\d+) pins?/)?.[1] ?? 0,
  );
}

test.describe("real Google Maps mobile lifecycle", () => {
  test("10 fresh contexts mount the real map with grounded pins", async ({ browser }) => {
    test.setTimeout(600_000);

    for (let run = 1; run <= 10; run += 1) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = captureErrors(page);
      await installRejectionCapture(page);

      try {
        await gotoChat(page);
        const grounded = await searchCafes(page);
        expect(grounded, `cold run ${run}: trigger pin count`).toBeGreaterThan(0);
        const sheet = await openSheet(page);
        await expect
          .poll(() => sheet.getByTestId("map-pin").count(), {
            timeout: 20_000,
            message: `cold run ${run}: expected visible café pins`,
          })
          .toBeGreaterThan(0);
        await expectRealMap(sheet);
        await closeMap(page);
        await assertNoPageErrors(page, errors, `cold run ${run}`);
      } finally {
        await context.close();
      }
    }
  });

  test("10 empty-state open/close cycles with no pins", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = captureErrors(page);
    await installRejectionCapture(page);

    await gotoChat(page);
    for (let cycle = 1; cycle <= 10; cycle += 1) {
      const sheet = await openSheet(page);
      await expect(sheet.getByTestId("map-pin")).toHaveCount(0);
      // The empty state overlays the map; the real map must still mount, or the
      // historical no-pin lifecycle would go untested.
      await expectRealMap(sheet);
      await expect(
        sheet.getByText("Search in chat to see available map locations."),
      ).toBeVisible({ timeout: 10_000 });
      await closeMap(page);
      await assertNoPageErrors(page, errors, `no-pin cycle ${cycle}`);
    }
  });

  test("10 open/close cycles keep the same grounded café pins", async ({ page }) => {
    test.setTimeout(420_000);
    const errors = captureErrors(page);
    await installRejectionCapture(page);

    await gotoChat(page);
    const grounded = await searchCafes(page);
    expect(grounded, "trigger pin count").toBeGreaterThan(0);

    let expectedPins: string[] = [];
    for (let cycle = 1; cycle <= 10; cycle += 1) {
      const sheet = await openSheet(page);
      await expect
        .poll(() => sheet.getByTestId("map-pin").count(), {
          timeout: 20_000,
          message: `cycle ${cycle}: expected visible café pins`,
        })
        .toBeGreaterThan(0);
      const pinIds = await sheet
        .getByTestId("map-pin")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-pin-id") ?? ""),
        );
      if (cycle === 1) {
        expectedPins = pinIds;
        expect(expectedPins.every(Boolean)).toBe(true);
      } else {
        expect(pinIds, `cycle ${cycle}: pin identity changed`).toEqual(expectedPins);
      }
      await expectRealMap(sheet);
      await closeMap(page);
      await assertNoPageErrors(page, errors, `3-pin cycle ${cycle}`);
    }
  });
});
