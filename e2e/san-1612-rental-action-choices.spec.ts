import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * SAN-1612 — the same apartment offers the same truthful choices wherever it appears.
 *
 * Read-only. It proves the gap this task existed for: a renter who finds an apartment on the map
 * (or in the phone sheet) can reach Booking Review with the apartment they actually selected and
 * the stay they already applied — and a sourced ad never offers a native booking.
 *
 * The panel carries `data-listing-id`, so identity is asserted against the record the panel is
 * showing rather than against the card we guessed.
 */

const cards = (page: Page) => page.locator('[data-testid^="rental-card-"][data-result-kind="rental"]');

async function openRentals(page: Page, query = "") {
  await page.goto(`/rentals${query}`, { waitUntil: "domcontentloaded" });
  await expect(cards(page).first()).toBeVisible({ timeout: 60_000 });
}

async function openFirstDetails(page: Page, surface: "panel" | "sheet"): Promise<Locator> {
  const testId = ((await cards(page).first().getAttribute("data-testid")) ?? "").replace("rental-card-", "");
  const opened = page.getByTestId(surface === "panel" ? "rental-details-panel" : "rental-details-sheet");
  await expect(async () => {
    await page.getByTestId(`rental-details-cta-${testId}`).click({ timeout: 2_000 });
    await expect(opened).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
  return opened;
}

/** The component's own provenance decision: the disclosure renders only for a sourced ad. */
const isExternal = async (page: Page) => (await page.getByTestId("rental-details-external-note").count()) > 0;

test.describe("SAN-1612 rental action choices — desktop panel", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a managed apartment reaches Booking Review from the map panel with its stay", async ({ page }) => {
    await openRentals(page, "?from=2026-11-10&through=2026-11-15");
    const panel = await openFirstDetails(page, "panel");
    test.skip(await isExternal(page), "the first result is a sourced ad; covered by the sourced-ad case");

    const review = panel.getByTestId("rental-details-booking-review-link");
    await expect(review).toBeVisible();
    const listingId = await panel.getAttribute("data-listing-id");
    const href = (await review.getAttribute("href")) ?? "";
    // Same apartment the panel is showing, and the applied stay.
    expect(href).toContain(`apartment=${listingId}`);
    expect(href).toMatch(/[?&]from=2026-11-10/);
    expect(href).toMatch(/[?&]through=2026-11-15/);
    // It must be a link, not a button, so assistive tech announces navigation.
    expect(await review.evaluate((el) => el.tagName)).toBe("A");
  });

  test("a sourced ad never offers a native booking from the panel", async ({ page }) => {
    await openRentals(page);
    const panel = await openFirstDetails(page, "panel");
    test.skip(!(await isExternal(page)), "the first result is MDE-managed; covered by the managed case");

    await expect(panel.getByTestId("rental-details-booking-review-link")).toHaveCount(0);
    const source = panel.getByTestId("rental-details-source-link");
    if ((await source.count()) > 0) {
      await expect(source).toHaveAttribute("href", /^https:\/\//);
      await expect(source).toHaveAttribute("target", "_blank");
      // The new tab is announced, not only performed.
      await expect(source).toContainText("opens in a new tab");
    }
  });
});

test.describe("SAN-1612 rental action choices — phone sheet 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the phone sheet offers the same Booking Review with the same stay", async ({ page }) => {
    await openRentals(page, "?from=2026-11-10&through=2026-11-15");
    const sheet = await openFirstDetails(page, "sheet");
    test.skip(await isExternal(page), "the first result is a sourced ad; no native booking is correct");
    await expect(page.getByTestId("rental-details-panel")).toHaveCount(0); // one surface only

    const review = sheet.getByTestId("rental-details-booking-review-link");
    await expect(review).toBeVisible();
    const listingId = await sheet.getAttribute("data-listing-id");
    const href = (await review.getAttribute("href")) ?? "";
    expect(href).toContain(`apartment=${listingId}`);
    expect(href).toMatch(/[?&]from=2026-11-10/);
    expect(href).toMatch(/[?&]through=2026-11-15/);

    // Touch target and no sideways scroll.
    const box = await review.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("the phone sheet names the action section truthfully", async ({ page }) => {
    await page.goto("/rentals", { waitUntil: "domcontentloaded" });
    const testId = ((await cards(page).first().getAttribute("data-testid")) ?? "").replace("rental-card-", "");
    await page.goto(`/rentals/${testId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("rental-detail-actions")).toBeVisible({ timeout: 60_000 });
    // The viewing CTA is not in this section, so the heading must not promise it.
    await expect(page.locator("#rental-actions-heading")).toHaveText("Other options");
  });
});
