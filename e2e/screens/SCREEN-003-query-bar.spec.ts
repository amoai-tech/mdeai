import { test, expect } from "@playwright/test";
import {
  gotoHome,
  RENTAL_QUERY,
  sendConciergeMessage,
  waitForCopilotIdle,
  waitForRentalCards,
} from "../helpers/maps-layout";
import {
  assertConsoleClean,
  captureScreenEvidence,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  watchCriticalConsoleErrors,
} from "../helpers/screen-evidence";

const SCREEN_ID = "SCREEN-003";

test.describe.configure({ mode: "serial" });

test.describe(`${SCREEN_ID} query bar + chips`, () => {
  test.describe("desktop", () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test("filter chips toggle active state", async ({ page }) => {
      const errors = watchCriticalConsoleErrors(page);
      await gotoHome(page);

      const bar = page.locator('[data-testid="chat-query-bar"]');
      await expect(bar).toBeVisible();

      const laureles = page.locator('[data-testid="filter-chip-laureles"]');
      await expect(laureles).toHaveAttribute("data-active", "false");
      await expect(laureles).toHaveAttribute("aria-pressed", "false");

      await laureles.click();
      await expect(laureles).toHaveAttribute("data-active", "true");
      await expect(laureles).toHaveAttribute("aria-pressed", "true");

      await laureles.click();
      await expect(laureles).toHaveAttribute("data-active", "false");

      await captureScreenEvidence(page, SCREEN_ID, "desktop-chips-active.png");
      assertConsoleClean(errors);
    });

    test("≥3 chips render in filter group", async ({ page }) => {
      await gotoHome(page);
      const chips = page.locator('[data-testid^="filter-chip-"]');
      await expect(chips).toHaveCount(6);
    });

    test("COP/month chip sends an exact monthly cap through the existing rental search", async ({ page }) => {
      await gotoHome(page);
      const price = page.locator('[data-testid="filter-chip-under-4m"]');
      await expect(price).toHaveText("Under COP 4M/month");
      const requestPromise = page.waitForRequest((req) =>
        req.method() === "POST" && req.url().includes("/api/rentals/search"),
      );
      await price.click();
      const request = await requestPromise;
      const params = request.postDataJSON() as Record<string, unknown>;
      expect(params).toMatchObject({
        maxPriceMonthly: 4_000_000,
        budgetCurrency: "COP",
        stayType: "monthly",
      });
      expect(params.maxPricePerNight).toBeUndefined();
      await expect(price).toHaveAttribute("aria-pressed", "true");
      await waitForRentalCards(page);
      await captureScreenEvidence(page, SCREEN_ID, "desktop-monthly-cop-chip.png");
    });

    test("rental query after Laureles chip shows cards", async ({ page }) => {
      await gotoHome(page);
      await page.locator('[data-testid="filter-chip-laureles"]').click();
      await sendConciergeMessage(page, RENTAL_QUERY);
      await waitForRentalCards(page);
      await expect(page.locator('[data-testid="rental-card"]').first()).toBeVisible();
      await captureScreenEvidence(page, SCREEN_ID, "desktop-rental-after-chip.png");
    });
  });

  test.describe("mobile", () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    /**
     * SAN-1606 — phones get the tab bar instead of a chip row. The chips and their caption are
     * display:none, so they cost no layout height and leave no stripe, while the desktop chips
     * above are unchanged and the filter state stays mounted behind them.
     */
    test("390px has no chip strip and no leftover space above the transcript", async ({ page }) => {
      const errors = watchCriticalConsoleErrors(page);
      await gotoHome(page);

      await expect(page.locator('[data-testid="chat-query-bar"]')).toBeHidden();
      expect(await page.locator('[data-testid="chat-query-bar"]').boundingBox()).toBeNull();
      await expect(page.locator('[data-testid="filter-chip-laureles"]')).toBeHidden();

      // The chat canvas starts where the header ends: the strip reserved nothing.
      const header = await page.locator('[data-testid="geo-chat-shell"] header').boundingBox();
      const canvas = await page.locator('[data-testid="chat-canvas"]').boundingBox();
      expect(canvas?.y).toBe((header?.y ?? 0) + (header?.height ?? 0));

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2,
      );
      expect(overflow).toBe(false);
      await captureScreenEvidence(page, SCREEN_ID, "mobile-no-chips.png");
      assertConsoleClean(errors);
    });

    test("a typed COP/month rental question still reaches the real rental search", async ({
      page,
    }) => {
      await gotoHome(page);
      const requested = page.waitForRequest(
        (req) => req.method() === "POST" && req.url().includes("/api/rentals/search"),
        { timeout: 90_000 },
      );
      await sendConciergeMessage(page, "2 bedrooms in Laureles under COP 4,000,000 per month");
      const request = await requested;
      const body = request.postDataJSON() as Record<string, unknown>;
      // Same parser path the desktop budget chip uses; the amount is the visitor's, not a fixture.
      // Compare numerically: a substring check would accept 40,000,000 for a 4,000,000 question.
      expect(Number(body.maxPriceMonthly), "monthly budget parsed from the typed question").toBe(4_000_000);
      // Let the accepted turn finish before the page closes (the helper tracks that response).
      await waitForCopilotIdle(page);
      await expect(page.locator('[data-testid="chat-query-bar"]')).toBeHidden();
    });
  });
});
