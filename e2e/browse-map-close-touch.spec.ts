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
      await page.setViewportSize(viewport);
      await page.goto(route, { waitUntil: "domcontentloaded" });

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
      // Reopening adds useful state coverage without repeating the slower step
      // for every width; check it once for each route at 390px.
      if (viewport.width === 390) {
        await trigger.click();
        await expect(map).toBeVisible();
        await close.click();
        await expect(close).toBeHidden();
      }
    });
  }
}
