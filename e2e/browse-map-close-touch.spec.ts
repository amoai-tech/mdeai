import { expect, test } from "@playwright/test";
import { waitUntilInteractive } from "./helpers/rental-journey-steps";

/**
 * SAN-524: the shared browse map sheet currently serves rentals and restaurants.
 * Verify the REAL rendered target size, not only its Tailwind class in jsdom.
 */
test("mobile rentals map Close button is a 44×44px rendered target and dismisses the sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/rentals", { waitUntil: "domcontentloaded" });

  const trigger = page.getByTestId("browse-map-fab");
  // The server-rendered Map button is visible before React attaches its click handler.
  await waitUntilInteractive(trigger, "the Map button");
  await trigger.click();

  const close = page.getByTestId("browse-map-close");
  await expect(close).toBeVisible();
  await expect
    .poll(async () => (await close.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(async () => (await close.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);

  await close.click();
  await expect(close).toBeHidden();
});
