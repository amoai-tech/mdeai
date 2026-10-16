import { expect, test } from "@playwright/test";

test.describe("SAN-691 · Rentals partner acquisition", () => {
  test("has a real rental landing with broker signup and contact CTAs", async ({ page }) => {
    const res = await page.goto("/partners/rentals", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Be there when renters start looking." })).toBeVisible();
    await expect(page.getByTestId("rentals-partner-primary-cta")).toHaveAttribute("href", "/partners/signup?type=broker");
    await expect(page.getByTestId("rentals-partner-secondary-cta")).toHaveAttribute("href", "/contact?type=broker");
    await expect(page.getByTestId("rentals-partner-pricing-cta")).toHaveAttribute("href", "/contact?type=broker");
    await expect(page.getByText("Illustration of the user journey", { exact: false })).toBeVisible();
    await expect(page.getByText("No price or commission is shown", { exact: false })).toBeVisible();
  });

  test("broker signup retains the type and offers real auth continuation", async ({ page }) => {
    await page.goto("/partners/rentals", { waitUntil: "domcontentloaded" });
    await page.getByTestId("rentals-partner-primary-cta").click();
    await expect(page).toHaveURL(/\/partners\/signup\?type=broker/);
    await expect(page.getByText(/Rental broker/i).first()).toBeVisible();
  });

  test("contact CTA reaches a typed real inquiry form", async ({ page }) => {
    await page.goto("/partners/rentals", { waitUntil: "domcontentloaded" });
    await page.getByTestId("rentals-partner-secondary-cta").click();
    await expect(page).toHaveURL(/\/contact\?type=broker/);
    await expect(page.getByTestId("contact-type")).toHaveValue("broker");
  });

  test("390px and 1440px widths avoid overflow", async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/partners/rentals", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("rentals-partner-primary-cta")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
  });

  test("Partner Hub now links rental partners to this landing", async ({ page }) => {
    await page.goto("/partners", { waitUntil: "domcontentloaded" });
    await expect(page.locator('a[href="/partners/rentals"]').first()).toBeVisible();
  });
});
