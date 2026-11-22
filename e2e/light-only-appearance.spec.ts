import { expect, test } from "@playwright/test";

/** The product uses light appearance even when the device prefers dark. */
const themeTokens = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--primary",
  "--border",
] as const;

async function readAppearance(page: import("@playwright/test").Page) {
  return page.evaluate((tokens) => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      colorScheme: root.colorScheme,
      backgroundColor: body.backgroundColor,
      textColor: body.color,
      tokens: Object.fromEntries(
        tokens.map((token) => [token, root.getPropertyValue(token).trim()]),
      ),
    };
  }, themeTokens);
}

for (const width of [1440, 390]) {
  test(`MDE remains light at ${width}px despite dark device preference`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("body")).toBeVisible();

    const light = await readAppearance(page);
    expect(light.colorScheme).toBe("light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => readAppearance(page)).toEqual(light);

    // In-app CSS must not override the product appearance when OS preference changes.
    expect((await readAppearance(page)).colorScheme).toBe("light");
  });
}
