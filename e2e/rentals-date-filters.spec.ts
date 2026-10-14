import { test, expect, type Page } from "@playwright/test";

/**
 * SAN-486 · /rentals From/Through stay dates live in the URL.
 *
 * Data-independent on purpose (it must pass with or without apartments): bad dates fail closed with
 * a clear, announced message and no results; real dates survive the form, the filter chips, refresh
 * and Clear; the phone layout fits with touch-sized controls. Which apartments match which dates is
 * covered by unit tests of the shared filter and the page.
 *
 * The filter bar renders once per layout (desktop and phone), so locators target the visible copy.
 */
const visible = (page: Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`);
const dateInput = (page: Page, label: "From" | "Through") =>
  page.locator("label:visible").filter({ hasText: new RegExp(`^${label}`) }).locator("input");

async function open(page: Page, query = "") {
  await page.goto(`/rentals${query}`, { waitUntil: "domcontentloaded" });
  await expect(visible(page, "rentals-date-form")).toBeVisible({ timeout: 60_000 });
}

test.describe("SAN-486 /rentals stay dates", () => {
  for (const [label, query] of [
    ["an impossible date", "?from=2026-02-31"],
    ["a reversed stay", "?from=2026-11-30&through=2026-11-01"],
  ] as const) {
    test(`${label} fails closed: an announced message and no apartments`, async ({ page }) => {
      await open(page, query);
      const alert = visible(page, "rentals-date-error");
      await expect(alert).toBeVisible();
      await expect(alert).toHaveAttribute("role", "alert");
      await expect(visible(page, "rentals-date-invalid")).toBeVisible();
      await expect(page.locator('[data-testid^="rental-card-"][data-pin-id]')).toHaveCount(0);
    });
  }

  test("real dates survive the form, a filter chip, a refresh, and Clear removes only the dates", async ({ page }) => {
    await open(page);
    await dateInput(page, "From").fill("2026-11-01");
    await dateInput(page, "Through").fill("2026-11-30");
    await visible(page, "rentals-dates-apply").click();
    await expect(page).toHaveURL(/from=2026-11-01&through=2026-11-30/);

    await visible(page, "rentals-filter-beds-1").click();
    await expect(page).toHaveURL(/beds=1&from=2026-11-01&through=2026-11-30/);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(dateInput(page, "From")).toHaveValue("2026-11-01");
    await expect(dateInput(page, "Through")).toHaveValue("2026-11-30");

    await visible(page, "rentals-dates-clear").click();
    await expect(page).toHaveURL(/\/rentals\?beds=1$/);
    await expect(dateInput(page, "From")).toHaveValue("");
  });

  test("390px phone: no sideways scroll and touch-sized date controls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "?from=2026-11-01&through=2026-11-30");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    for (const control of [dateInput(page, "From"), dateInput(page, "Through"), visible(page, "rentals-dates-apply")]) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
