import { expect, test } from "@playwright/test";
import { waitUntilInteractive } from "./helpers/rental-journey-steps";

// CI continues using its pinned Playwright Chromium. On a developer machine whose
// headless-shell build is unavailable, opt in to installed stable Chrome.
test.use({
  hasTouch: true,
  isMobile: true,
  channel: process.env.PW_USE_SYSTEM_CHROME === "1" ? "chrome" : undefined,
});

/**
 * SAN-524: check the actual rendered browse map sheet on both routes.
 * Mock Maps avoids billing/API-key restrictions, but CSS is rendered by Chromium.
 */
for (const route of ["/rentals", "/restaurants"]) {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
  ]) {
    test(`${route} mobile map keeps Close out of the map viewport at ${viewport.width}px`, async ({ page }) => {
      // The first /rentals visit in a cold Next.js dev shard compiles the entire
      // server route and waits on its data source. That cost is unrelated to
      // this map-sheet geometry check; keep the UI assertions unchanged.
      test.slow(route === "/rentals", "Cold /rentals compilation in the deterministic CI shard");
      await page.setViewportSize(viewport);
      await page.goto(route, { waitUntil: "commit" });

      const trigger = page.getByTestId("browse-map-fab");
      await waitUntilInteractive(trigger, "the Map button");
      await trigger.click();

      const toolbar = page.getByTestId("browse-map-toolbar");
      const close = page.getByTestId("browse-map-close");
      // Desktop browse map remains mounted but hidden at phone widths; scope to the sheet.
      const map = page.locator('[data-slot="sheet-content"]').getByTestId("chat-map");
      await expect(toolbar).toBeVisible();
      await expect(close).toBeVisible();
      await expect(map).toBeVisible();
      // CI uses the real MDE map component with a deterministic maps mock.
      // A visible sheet is not the same as tiles being ready; wait for the
      // tile-ready callback to remove the customer-facing loading state.
      await expect(page.getByTestId("browse-map-loading")).toBeHidden({ timeout: 15_000 });
      await expect(map).toHaveAttribute("data-e2e-mock-map", "true");

      // Poll to allow the bottom sheet's slide-in transform to settle.
      await expect
        .poll(async () => {
          const rect = await close.boundingBox();
          return rect ? Math.min(rect.width, rect.height) : 0;
        })
        .toBeGreaterThanOrEqual(44);

      await expect
        .poll(async () => {
          const [header, closeBox, mapBox] = await Promise.all([
            toolbar.boundingBox(), close.boundingBox(), map.boundingBox(),
          ]);
          if (!header || !closeBox || !mapBox) return null;
          return {
            closeAboveMap: closeBox.y + closeBox.height <= mapBox.y,
            // No gap between the header and map: SheetContent defaults to gap-4
            // and must override it for this full-bleed map panel.
            gapPx: Math.round(mapBox.y - (header.y + header.height)),
            mapHeight: Math.round(mapBox.height),
          };
        })
        .toMatchObject({ closeAboveMap: true, gapPx: 0, mapHeight: 520 });

      await close.click();
      await expect(close).toBeHidden();
      // The mobile sheet must return keyboard focus to its actual Map trigger.
      await expect(trigger).toBeFocused();
      // Reopening adds useful state coverage without repeating the slower step
      // for every width; check it once for each route at 390px.
      if (viewport.width === 390) {
        await trigger.click();
        await expect(map).toBeVisible();
        await expect(page.getByTestId("browse-map-loading")).toBeHidden({ timeout: 15_000 });
        await close.click();
        await expect(close).toBeHidden();
      }
    });
  }
}

test("390px Rentals exposes compact filters and account without losing the map or composer", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/rentals", { waitUntil: "domcontentloaded" });
  const filter = page.getByTestId("rentals-mobile-filters-trigger");
  await waitUntilInteractive(filter, "mobile filters");
  await expect(page.getByRole("group", { name: "Neighborhood filters" })).toHaveCount(0);
  await expect(page.getByTestId("workspace-mobile-profile")).toBeVisible();
  expect((await filter.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await filter.click();
  const sheet = page.getByTestId("rentals-mobile-filter-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("group", { name: "Neighborhood filters" })).toBeVisible();
  const date = sheet.getByTestId("rentals-dates-trigger");
  await date.click();
  const calendar = page.getByTestId("rentals-dates-dialog");
  await expect(calendar).toBeVisible();
  await calendar.getByTestId("rentals-dates-cancel").click();
  await expect(calendar).toBeHidden();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Show apartments" }).click();
  await expect(sheet).toBeHidden();
  await page.getByTestId("workspace-mobile-profile").click();
  const profile = page.getByRole("dialog", { name: "Profile" });
  await expect(profile).toBeVisible();
  await profile.getByRole("button", { name: "Close" }).click();
  await expect(profile).toBeHidden();
  const map = page.getByTestId("browse-map-fab");
  const composer = page.getByTestId("workspace-ask-composer");
  await expect(map).toBeInViewport();
  await expect(composer).toBeInViewport();
  const [mapBox, composerBox] = await Promise.all([map.boundingBox(), composer.boundingBox()]);
  expect(mapBox!.height).toBeGreaterThanOrEqual(44);
  expect(mapBox!.y + mapBox!.height).toBeLessThanOrEqual(composerBox!.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(filter).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Neighborhood filters" })).toBeVisible();
});

for (const viewport of [{ width: 844, height: 390 }, { width: 320, height: 256 }]) {
  test(`Rentals keeps the map reachable and closable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.slow();
    await page.setViewportSize(viewport);
    await page.goto("/rentals", { waitUntil: "domcontentloaded" });
    const trigger = page.getByTestId("browse-map-fab");
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toBeVisible({ timeout: 10000 });
    await expect(trigger).toHaveCSS("position", "static");
    await waitUntilInteractive(trigger, "short-screen Map button");
    await trigger.click();
    const close = page.getByTestId("browse-map-close");
    const map = page.locator('[data-slot="sheet-content"]').getByTestId("chat-map");
    await expect(close).toBeInViewport();
    await expect(map).toBeVisible();
    await expect(page.getByTestId("browse-map-loading")).toBeHidden({ timeout: 15000 });
    await expect.poll(async () => {
      const rect = await close.boundingBox();
      return rect ? rect.y >= 0 && rect.y + rect.height <= viewport.height && rect.height >= 44 : false;
    }).toBe(true);
    await close.click();
    await expect(close).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(trigger).toHaveCSS("position", "fixed");
    await expect(trigger).toBeInViewport();
  });
}
