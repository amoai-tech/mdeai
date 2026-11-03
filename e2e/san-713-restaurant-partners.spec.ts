import { expect, test } from "@playwright/test";

test.describe("SAN-713 · Restaurant partner journey", () => {
  test("dedicated URL uses the real restaurant venue landing and typed signup", async ({ page }) => {
    const response = await page.goto("/partners/restaurants", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: /be the answer when visitors ask where to eat/i })).toBeVisible();

    const signupHref = "/partners/signup?type=venue&category=restaurant";
    await expect(page.getByTestId("venues-landing-primary-cta")).toHaveAttribute("href", signupHref);
    await expect(page.getByTestId("venues-landing-pricing-cta")).toHaveAttribute("href", "#demo");
    await expect(page.getByTestId("venues-landing-field-venue-type")).toHaveValue("restaurant");
    await page.getByTestId("venues-landing-pricing-cta").click();
    await expect(page.getByTestId("venues-landing-lead-form")).toBeVisible();
  });

  test("all venue vertical signup links preserve known category", async ({ page }) => {
    for (const category of ["restaurant", "cafe", "nightclub"]) {
      await page.goto(`/venues?v=${category}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("venues-landing-primary-cta")).toHaveAttribute(
        "href", `/partners/signup?type=venue&category=${category}`,
      );
    }
    await page.goto("/venues?v=space", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("venues-landing-primary-cta")).toHaveAttribute("href", "/partners/signup?type=venue");
  });

  test("390px mobile: content and actions fit the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/partners/restaurants", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("venues-landing-primary-cta")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
