import { test, expect } from "@playwright/test";
import { gotoHome, RENTAL_QUERY, sendConciergeMessage, waitForRentalCards } from "../helpers/maps-layout";
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

    test("390px COP/month chip requests real monthly budget and stays readable", async ({ page }) => {
      await gotoHome(page);
      const price = page.locator('[data-testid="filter-chip-under-4m"]');
      await expect(price).toBeVisible();
      const requested = page.waitForRequest((req) =>
        req.method() === "POST" && req.url().includes("/api/rentals/search"),
      );
      await price.click();
      const req = await requested;
      expect(req.postDataJSON()).toMatchObject({
        maxPriceMonthly: 4_000_000,
        budgetCurrency: "COP",
        stayType: "monthly",
      });
      expect(req.postDataJSON().maxPricePerNight).toBeUndefined();
      await expect(price).toHaveAttribute("aria-pressed", "true");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2,
      );
      expect(overflow).toBe(false);
      await captureScreenEvidence(page, SCREEN_ID, "mobile-monthly-cop-chip.png");
    });

    test("chips wrap without horizontal page overflow", async ({ page }) => {
      const errors = watchCriticalConsoleErrors(page);
      await gotoHome(page);

      await expect(page.locator('[data-testid="chat-query-bar"]')).toBeVisible();
      await page.locator('[data-testid="filter-chip-poblado"]').click();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2,
      );
      expect(overflow).toBe(false);

      await captureScreenEvidence(page, SCREEN_ID, "mobile-chips.png");
      assertConsoleClean(errors);
    });
  });
});
