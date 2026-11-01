import { expect, test, type Page } from "@playwright/test";

/**
 * SAN-486 / SAN-1611 — the renter's stay, from the calendar to the booking review.
 *
 * SAN-1611 replaced the native date inputs with the shadcn Calendar in an accessible dialog, so
 * these cases now drive the calendar. The URL remains the single owner of the applied dates: the
 * calendar edits a DRAFT, and only Apply commits.
 *
 * Data-independent where possible (it must pass with or without apartments): bad dates fail
 * closed, real dates survive the dialog, chips and refresh, and Cancel leaves the URL untouched.
 */
const trigger = (page: Page) => page.getByTestId("rentals-dates-trigger").first();
const dialog = (page: Page) => page.getByTestId("rentals-dates-dialog");
const day = (page: Page, compact: string) => dialog(page).locator(`button[data-day="${compact}"]`);

async function open(page: Page, query = "") {
  await page.goto(`/rentals${query}`, { waitUntil: "domcontentloaded" });
  await expect(trigger(page)).toBeVisible({ timeout: 60_000 });
}

/**
 * Select a day without depending on which month the calendar opens on. DayPicker exposes its
 * navigation as accessible "Go to the Next/Previous Month" buttons, so we walk to the target
 * month only when the day is not already rendered. No fake clock: a frozen Date can stall
 * hydration and animations in ways that make these tests flaky for the wrong reason.
 */
async function pickDay(page: Page, iso: string) {
  const [year, month, dayOfMonth] = iso.split("-").map(Number);
  const target = day(page, `${month}/${dayOfMonth}/${year}`);
  if ((await target.count()) === 0) {
    const today = new Date();
    const delta = (year - today.getFullYear()) * 12 + (month - 1 - today.getMonth());
    const direction = delta >= 0 ? /next month/i : /previous month/i;
    for (let step = 0; step < 24; step += 1) {
      await dialog(page).getByRole("button", { name: direction }).click();
      if ((await target.count()) > 0) break;
    }
  }
  await expect(target).toBeVisible();
  await target.click();
}

async function openCalendar(page: Page) {
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
}

test.describe("SAN-1611 /rentals stay dates", () => {
  for (const [label, query] of [
    ["an impossible date", "?from=2026-02-31"],
    ["a reversed stay", "?from=2026-11-30&through=2026-11-01"],
  ] as const) {
    test(`${label} fails closed: an announced message and no apartments`, async ({ page }) => {
      await open(page, query);
      const alert = page.getByTestId("rentals-date-error");
      await expect(alert).toBeVisible();
      await expect(alert).toHaveAttribute("role", "alert");
      await expect(page.locator('[data-testid^="rental-card-"][data-pin-id]')).toHaveCount(0);
    });
  }

  test("real dates survive the calendar, a filter chip, a refresh, and Clear removes only the dates", async ({ page }) => {
    await open(page, "?from=2026-11-01&through=2026-11-30");
    // The applied stay is what the trigger reports, before any interaction.
    await expect(trigger(page)).toContainText("Nov 1, 2026");
    await expect(trigger(page)).toContainText("Nov 30, 2026");

    // A chip keeps the dates, and so does a refresh.
    await page.getByTestId("rentals-filter-beds-1").first().click();
    await expect(page).toHaveURL(/beds=1&from=2026-11-01&through=2026-11-30/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(trigger(page)).toContainText("Nov 1, 2026");

    // Clear removes the dates and keeps the bedroom chip.
    await openCalendar(page);
    await page.getByTestId("rentals-dates-clear").click();
    await expect(page).toHaveURL(/\/rentals\?beds=1$/);
    await expect(trigger(page)).toHaveText(/Any dates/);
  });

  test("picking a range in the calendar applies the inclusive stay", async ({ page }) => {
    await open(page);
    await openCalendar(page);
    await pickDay(page, "2026-11-10");
    await pickDay(page, "2026-11-15");
    await expect(page.getByTestId("rentals-dates-summary")).toContainText("Nov 10, 2026");
    await expect(page.getByTestId("rentals-dates-summary")).toContainText("Nov 15, 2026");
    await page.getByTestId("rentals-dates-apply").click();
    // Inclusive: both ends are kept, exactly as the search contract expects.
    await expect(page).toHaveURL(/from=2026-11-10&through=2026-11-15/);
    await expect(trigger(page)).toContainText("Nov 10, 2026");
  });

  test("Cancel discards the draft and leaves the applied stay untouched", async ({ page }) => {
    await open(page, "?from=2026-11-10&through=2026-11-15");
    const before = page.url();
    await openCalendar(page);
    await pickDay(page, "2026-11-20");
    await page.getByTestId("rentals-dates-cancel").click();
    await expect(dialog(page)).toBeHidden();
    expect(page.url()).toBe(before);
    await expect(trigger(page)).toContainText("Nov 10, 2026");
  });

  test("Escape closes the draft without applying it", async ({ page }) => {
    await open(page, "?from=2026-11-10&through=2026-11-15");
    const before = page.url();
    await openCalendar(page);
    await pickDay(page, "2026-11-20");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    expect(page.url()).toBe(before);
  });

  test("390px phone: no sideways scroll and touch-sized calendar controls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "?from=2026-11-01&through=2026-11-30");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(trigger(page)).toBeVisible();

    await openCalendar(page);
    // The dialog scales in, so measure with a retrying poll rather than one transient box.
    for (const id of ["rentals-dates-apply", "rentals-dates-cancel"]) {
      await expect(page.getByTestId(id)).toBeVisible();
      await expect
        .poll(async () => (await page.getByTestId(id).boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(44);
    }
    await expect
      .poll(async () => (await trigger(page).boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
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
    const href = (await review.getAttribute("href")) ?? "";
    expect(href).toContain(`apartment=${slug}`);
    expect(href).toMatch(/[?&]from=2026-11-10/);
    expect(href).toMatch(/[?&]through=2026-11-15/);
  });

  test("signing in keeps the stay, and an impossible date is never carried", async ({ page }) => {
    await open(page);
    const card = page.locator('[data-testid^="rental-card-"][data-result-kind="rental"]').first();
    test.skip((await card.count()) === 0, "no rental cards in the current results");
    const slug = ((await card.getAttribute("data-testid")) ?? "").replace("rental-card-", "");

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
      await settleReview();
      await expect(page.getByTestId("booking-start-date")).toHaveValue("2026-11-10");
      // `through` is the last occupied day; the booking stores the day they leave.
      await expect(page.getByTestId("booking-start-end-date")).toHaveValue("2026-11-16");
    } else {
      expect(next).toContain("from=2026-11-10");
      expect(next).toContain("through=2026-11-15");
    }

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
