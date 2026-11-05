import { expect, test } from "@playwright/test";

// Isolate the regression from any signed-in QA browser state.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The real guest /info 401 regression is covered by concierge-guest-startup.spec.ts
 * across mobile/tablet/desktop. Here we prove that the CTA follows submission,
 * not merely typing into the composer.
 */
test("anonymous AI attempt gets a sign-in CTA, not an error notice", async ({ page }) => {
  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  const box = page.getByTestId("copilot-chat-textarea");
  await expect(box).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("concierge-sign-in-prompt")).toHaveCount(0);
  await box.fill("Only Laureles");
  await expect(page.getByTestId("concierge-sign-in-prompt")).toHaveCount(0);
  await box.press("Enter");
  await expect(page.getByTestId("concierge-sign-in-prompt")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("concierge-error-notice")).toHaveCount(0);
});
