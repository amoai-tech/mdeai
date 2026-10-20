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
/**
 * The contest pages read `vote` through a service-role-only function.
 *
 * The skip keys off the CREDENTIAL, never off the error banner. Deciding from `contests-error`
 * conflated "this environment has no key" with "the database read just failed" — and a real
 * outage, a broken RPC or a regression would then be quietly skipped instead of failing. Here a
 * present credential means every contest-read failure must fail the test.
 */
const hasContestCredential = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
);

function skipWithoutContestCredential() {
  if (!hasContestCredential) {
    test.skip(
      true,
      "contest reads need a service-role Supabase credential; this environment has none",
    );
    return true;
  }
  return false;
}

test.describe("public contest discovery", { tag: ["@contests"] }, () => {
  test("restaurant directory links to contest discovery", async ({ page }) => {
    await page.goto("/restaurants");
    await expect(page.getByRole("link", { name: "Explore restaurant contests" })).toHaveAttribute("href", "/contests");
  });

  test("lists real contests and opens one", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(String(error).slice(0, 120)));
    page.on("response", (response) => {
      if (response.status() >= 500) problems.push("http " + response.status() + " " + response.url());
    });

    await page.goto("/contests");
    await expect(page.getByTestId("contests-page")).toBeVisible();

    if (skipWithoutContestCredential()) return;

    // Either real contests or the honest empty state — never a blank page or an error.
    await expect(page.getByTestId("contests-error")).toHaveCount(0);
    const cards = page.locator('[data-testid^="contest-card-"]');
    const cardCount = await cards.count();
    if (cardCount === 0) {
      await expect(page.getByTestId("contests-empty")).toBeVisible();
      expect(problems, "empty state must also be error-free").toEqual([]);
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
    const expectedTitle = (await cards.first().locator("h2").innerText()).trim();
    await cards.first().locator("a").first().click();
    await expect(page).toHaveURL(/\/contests\/.+/, { timeout: 20_000 });
    await expect(page.getByTestId("contest-title")).toHaveText(expectedTitle);
    await expect(page.getByTestId("contest-error")).toHaveCount(0);

    // Nominees, when present, must carry the contest identity into the restaurant page.
    const nomineeLinks = page.locator('[data-testid="contest-nominees"] a');
    if ((await nomineeLinks.count()) > 0) {
      const href = await nomineeLinks.first().getAttribute("href");
      expect(href).toContain("/restaurants/");
      const contestId = await page.getByTestId("contest-page").getAttribute("data-contest-id");
      expect(contestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(new URL(href!, "http://localhost").searchParams.get("contest_id")).toBe(contestId);
    } else {
      await expect(page.getByTestId("contest-nominees-empty")).toBeVisible();
    }

    expect(problems, "no console errors or 5xx while browsing").toEqual([]);
  });


  // Layout is asserted, not inferred from markup: a class name does not prove a rendered height,
  // and a stacking bug once shipped while every string assertion passed.
  test("the featured contest keeps a 16:10 panel on phones and sits beside its text on desktop", async ({
    page,
  }) => {
    await page.goto("/contests");
    const featured = page.locator('[data-featured="true"]');
    const cards = page.locator('[data-testid^="contest-card-"]');
    const cardCount = await cards.count();

    if (skipWithoutContestCredential()) return;

    expect(cardCount, "the public contest list must render at least one contest here").toBeGreaterThan(0);

    if (cardCount > 1) {
      // More than one contest: the grid is correct, and the featured treatment must NOT appear.
      await expect(page.getByTestId("contests-list")).toBeVisible();
      await expect(featured).toHaveCount(0);
      return;
    }

    const link = featured.locator("a").first();
    const parts = link.locator(":scope > div");

    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await parts.nth(1).boundingBox();
    expect(phone, "the visual panel must render on a phone").not.toBeNull();
    // A collapsed panel is the bug this guards: it rendered 64px before the explicit frame.
    expect(phone!.height, "the phone panel must not collapse").toBeGreaterThan(150);
    expect(phone!.width / phone!.height).toBeGreaterThan(1.4);
    expect(phone!.width / phone!.height).toBeLessThan(1.8);

    await page.setViewportSize({ width: 1440, height: 900 });
    const textBox = await parts.nth(0).boundingBox();
    const visualBox = await parts.nth(1).boundingBox();
    expect(textBox && visualBox).toBeTruthy();
    const topGap = Math.abs(textBox!.y - visualBox!.y);
    expect(topGap, "desktop must place the visual beside the text, not under it").toBeLessThan(8);
    expect(visualBox!.x).toBeGreaterThan(textBox!.x);
  });

  test("an unknown contest is a 404, not an empty page", async ({ page }) => {
    const response = await page.goto("/contests/san-1524-does-not-exist");
    // Without credentials the read fails, the page renders its error state and answers 200.
    if (skipWithoutContestCredential()) return;
    expect(response?.status()).toBe(404);
  });
});
