import { expect, test } from "@playwright/test";

const categories = [
  {
    url: "/partners/cafes",
    heading: /where medellín's nomads work next/i,
    category: "cafe",
    leadType: "cafe",
  },
  {
    url: "/partners/nightlife",
    heading: /slow tuesdays are a software problem/i,
    category: "nightclub",
    leadType: "nightclub",
  },
] as const;

test.describe("SAN-714 / SAN-712 · Partner landings reuse venue funnel", () => {
  for (const category of categories) {
    test(`${category.url} opens a functional venue signup and inquiry path`, async ({ page }) => {
      const res = await page.goto(category.url, { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: category.heading })).toBeVisible();
      await expect(page.getByTestId("venues-landing-primary-cta")).toHaveAttribute(
        "href", `/partners/signup?type=venue&category=${category.category}`,
      );
      await expect(page.getByTestId("venues-landing-field-venue-type")).toHaveValue(category.leadType);
      await page.getByTestId("venues-landing-pricing-cta").click();
      await expect(page.getByTestId("venues-landing-lead-form")).toBeVisible();
    });

    test(`${category.url} fits 390px and keeps an accessible signup CTA`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(category.url, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("venues-landing-primary-cta")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    });
  }
});
