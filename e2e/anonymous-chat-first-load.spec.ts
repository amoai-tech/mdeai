import { expect, test } from "@playwright/test";

/**
 * SAN-1507 residual: a signed-out visitor on /chat must not see a concierge
 * failure before attempting anything. The anonymous runtime probe is a 401 and
 * must not be rendered as "Something went wrong".
 */
test("anonymous /chat has no false assistant error before interaction", async ({ page }) => {
  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("copilot-chat-textarea")).toBeVisible({ timeout: 60_000 });
  // Wait for the anonymous runtime probe itself, not a fixed sleep: the notice must
  // stay absent after the 401, which is the failure this regression covers.
  await page
    .waitForResponse((r) => r.url().includes("/api/copilotkit"), { timeout: 30_000 })
    .catch(() => null);
  await expect(page.getByTestId("concierge-error-notice")).toHaveCount(0);
  await expect(page.getByTestId("concierge-sign-in-prompt")).toHaveCount(0);
});

test("anonymous AI attempt gets a sign-in CTA, not an error notice", async ({ page }) => {
  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  const box = page.getByTestId("copilot-chat-textarea");
  await expect(box).toBeVisible({ timeout: 60_000 });
  await box.fill("Only Laureles");
  await box.press("Enter");
  await expect(page.getByTestId("concierge-sign-in-prompt")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("concierge-error-notice")).toHaveCount(0);
});
