import { expect, test } from "@playwright/test";

/**
 * SAN-1416 — a shared, bookmarked or reloaded `/rentals/{slug}` link for an approved
 * source-linked advertisement must open the canonical detail page, with genuine source
 * attribution and the advertiser's own link, instead of "not found".
 *
 * The approved ads are not reliably discoverable as cards on /rentals (the canonical search
 * renders them as ordinary listings), so this spec addresses one by its approved slug. Read-only.
 */
const APPROVED_AD_SLUG = "candidate-fincaraiz-194104380";

test.describe("direct link to an approved source-linked ad", () => {
  test("opens the canonical detail page, and an unknown id answers HTTP 404", async ({ page }) => {
    const response = await page.goto(`/rentals/${APPROVED_AD_SLUG}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("rental-detail")).toBeVisible();
    await expect(page.getByTestId("rental-detail-not-found")).toHaveCount(0);
    // Genuine source attribution: the advertiser's own link plus the unverified disclosure.
    await expect(page.getByTestId("rental-detail-source-link")).toHaveAttribute("href", /fincaraiz\.com\.co/);
    await expect(page.getByTestId("rental-self-attested-label")).toBeVisible();
    // The same stored fact the list showed: a monthly COP rent, not a derived nightly figure.
    await expect(page.getByTestId("rental-detail").getByText(/COP [\d,]+\/mo/).first()).toBeVisible();

    // An id outside the approved inventory must answer HTTP 404, not a 200 "not found" page.
    const missing = await page.goto("/rentals/candidate-fincaraiz-000000000", { waitUntil: "domcontentloaded" });
    expect(missing?.status()).toBe(404);
    await expect(page.getByTestId("rental-detail-not-found")).toBeVisible();
  });
});
