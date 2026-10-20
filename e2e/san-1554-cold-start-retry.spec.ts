import { test, expect } from "@playwright/test";
import { hasE2eEnv, signInAs } from "./helpers/auth";

/**
 * Real-chat regression for SAN-1554: the first message in an empty thread is an event search,
 * and the events API fails. The transcript tail is not mounted yet, so the error notice must live
 * outside it and still be announced.
 */
test.describe("SAN-1554 — first failed event search", () => {
  test.skip(!hasE2eEnv(), "Supabase service key required for authenticated chat");

  test("keeps Retry visible and announced with an empty transcript", async ({ page }) => {
    await signInAs(page);
    let eventRequests = 0;
    await page.route("**/api/events/search", async (route) => {
      eventRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporarily unavailable" }),
      });
    });

    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    const input = page.locator("textarea").last();
    await input.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(2_000);

    // The real CopilotKit welcome screen owns the empty thread: no result tail exists.
    await expect(page.getByTestId("concierge-transcript-tail")).toHaveCount(0);

    await input.fill("events this weekend");
    await input.press("Enter");

    const notice = page.getByTestId("concierge-error-notice");
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toHaveAttribute("role", "alert");
    await expect(page.getByTestId("concierge-transcript-tail")).toHaveCount(0);
    expect(eventRequests, "one failed event search").toBe(1);
  });
});
