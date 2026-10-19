import { expect, test } from "@playwright/test";

/**
 * SAN-1524 · the public contest journey.
 *
 * These pages read `vote` through a service-role-only function, so nothing here can be proven by a
 * component test: the page either reaches the database or it does not.
 *
 * The assertions deliberately avoid a hardcoded contest slug — they follow whatever the list
 * renders, so the suite keeps working as contests come and go.
 */
test.describe("public contest discovery", { tag: ["@contests"] }, () => {
  test("lists real contests and opens one", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(String(error).slice(0, 120)));
    page.on("response", (response) => {
      if (response.status() >= 500) problems.push("http " + response.status() + " " + response.url());
    });

    await page.goto("/contests");
    await expect(page.getByTestId("contests-page")).toBeVisible();

    // Either real contests or the honest empty state — never a blank page or an error.
    await expect(page.getByTestId("contests-error")).toHaveCount(0);
    const cards = page.locator('[data-testid^="contest-card-"]');
    const cardCount = await cards.count();
    if (cardCount === 0) {
      await expect(page.getByTestId("contests-empty")).toBeVisible();
      return;
    }

    // No horizontal overflow at the narrowest supported width.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/contests");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "contest list must not overflow at 390px").toBeLessThanOrEqual(1);
    await page.screenshot({ fullPage: true, path: "test-results/san-1524-contests-390.png" });

    // A cold dev server hydrates lazily; a <Link> clicked before hydration does nothing.
    await page.waitForLoadState("networkidle");
    await cards.first().locator("a").first().click();
    await expect(page).toHaveURL(/\/contests\/.+/, { timeout: 20_000 });
    await expect(page.getByTestId("contest-title")).toBeVisible();
    await expect(page.getByTestId("contest-error")).toHaveCount(0);

    // Nominees, when present, must carry the contest identity into the restaurant page.
    const nomineeLinks = page.locator('[data-testid="contest-nominees"] a');
    if ((await nomineeLinks.count()) > 0) {
      const href = await nomineeLinks.first().getAttribute("href");
      expect(href).toContain("/restaurants/");
      expect(href).toContain("contest_id=");
    } else {
      await expect(page.getByTestId("contest-nominees-empty")).toBeVisible();
    }

    expect(problems, "no console errors or 5xx while browsing").toEqual([]);
  });

  test("an unknown contest is a 404, not an empty page", async ({ page }) => {
    const response = await page.goto("/contests/san-1524-does-not-exist");
    expect(response?.status()).toBe(404);
  });
});
