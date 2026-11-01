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
  page.locator("label:visible").filter({ hasText: label }).locator("input");

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
      await expect(control).toBeVisible();
      // Route hydration can replace the input between locator resolution and layout.
      // Poll the actual rendered target rather than dereferencing a transient null bounding box.
      await expect.poll(async () => (await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test("Cancel puts the applied dates back without losing the other filters", async ({ page }) => {
    await open(page, "?neighborhood=Laureles&from=2026-11-01&through=2026-11-30");
    // Nothing edited yet: there is no draft to cancel.
    await expect(visible(page, "rentals-dates-cancel")).toHaveCount(0);

    await dateInput(page, "From").fill("2026-12-05");
    const cancel = visible(page, "rentals-dates-cancel");
    await expect(cancel).toBeVisible();
    await expect(cancel).toHaveText("Cancel");

    await cancel.click();
    // The applied pair is restored, the chips survive, and the draft is gone.
    await expect(dateInput(page, "From")).toHaveValue("2026-11-01");
    await expect(dateInput(page, "Through")).toHaveValue("2026-11-30");
    await expect(page).toHaveURL(/neighborhood=Laureles/);
    await expect(page).toHaveURL(/from=2026-11-01/);
    await expect(visible(page, "rentals-dates-cancel")).toHaveCount(0);
    // Cancel never submits: the results are the same ones the renter already had.
    await expect(visible(page, "rentals-date-form")).toBeVisible();
  });

  test("the applied stay follows the renter into the booking review", async ({ page }) => {
    await open(page);
    const card = page.locator('[data-testid^="rental-card-"][data-result-kind="rental"]').first();
    test.skip((await card.count()) === 0, "no rental cards in the current results");
    const slug = ((await card.getAttribute("data-testid")) ?? "").replace("rental-card-", "");

    await page.goto(`/rentals/${slug}?from=2026-11-10&through=2026-11-15`, {
      waitUntil: "domcontentloaded",
    });
    const review = page.getByTestId("rental-detail-booking-review-link");
    await expect(review).toBeVisible();
    await expect(review).toHaveAttribute("href", new RegExp(`apartment=${slug}`));
    await expect(review).toHaveAttribute("href", /from=2026-11-10/);
    await expect(review).toHaveAttribute("href", /through=2026-11-15/);
  });

  test("signing in keeps the stay, and an impossible date is never carried", async ({ page }) => {
    await open(page);
    const card = page.locator('[data-testid^="rental-card-"][data-result-kind="rental"]').first();
    test.skip((await card.count()) === 0, "no rental cards in the current results");
    const slug = ((await card.getAttribute("data-testid")) ?? "").replace("rental-card-", "");

    // The review route decides between a sign-in gate and the form on the server, so wait for
    // whichever one this session gets before asking which it was.
    const settleReview = () =>
      page.waitForSelector(
        '[data-testid="booking-review-auth-required"], [data-testid="booking-start-date"]',
        { timeout: 30_000 },
      );
    const signInNext = async () => {
      await settleReview();
      const gate = page.getByTestId("booking-review-auth-required");
      if ((await gate.count()) === 0) return null;
      const href = await gate.locator('a[href^="/login"]').first().getAttribute("href");
      return href ? decodeURIComponent(href) : null;
    };

    await page.goto(`/rentals/bookings/new?apartment=${slug}&from=2026-11-10&through=2026-11-15`, {
      waitUntil: "domcontentloaded",
    });
    const next = await signInNext();
    if (next === null) {
      // A signed-in session skips the gate: the form itself must then be prefilled.
      await settleReview();
      await expect(page.getByTestId("booking-start-date")).toHaveValue("2026-11-10");
      await expect(page.getByTestId("booking-start-end-date")).toHaveValue("2026-11-15");
    } else {
      expect(next).toContain("from=2026-11-10");
      expect(next).toContain("through=2026-11-15");
    }

    // A calendar date that does not exist must not survive into the prefill.
    await page.goto(`/rentals/bookings/new?apartment=${slug}&from=2026-02-31&through=2026-11-15`, {
      waitUntil: "domcontentloaded",
    });
    const invalidNext = await signInNext();
    if (invalidNext === null) {
      await settleReview();
      await expect(page.getByTestId("booking-start-date")).toHaveValue("");
    } else {
      expect(invalidNext).not.toContain("from=");
    }
  });
});
