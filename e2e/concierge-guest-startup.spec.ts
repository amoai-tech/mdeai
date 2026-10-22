import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

for (const width of [390, 768, 1440]) {
  test(`guest /chat startup at ${width}px reports no failed AI turn`, async ({ page }, testInfo) => {
    // Cold CI compiles /chat and /api/copilotkit sequentially on first visit.
    // Preserve the exact 401 assertion instead of skipping a slow request.
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });

    // Observe the real denied runtime-info probe; no mocked auth, provider or agent.
    const infoResponse = page.waitForResponse((response) => {
      if (!response.url().includes("/api/copilotkit") || response.request().method() !== "POST") return false;
      try {
        return (response.request().postDataJSON() as { method?: string }).method === "info";
      } catch {
        return false;
      }
    }, { timeout: 90_000 });

    const pageResponse = await page.goto("/chat", { waitUntil: "domcontentloaded" });
    expect(pageResponse?.status()).toBe(200);
    const response = await infoResponse;
    expect(response.status()).toBe(401);
    await expect(page.locator("textarea").first()).toBeVisible();

    // Let React process the settled runtime probe without introducing a
    // timing-dependent sleep (forbidden by the MDE Playwright contract).
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    // Assert the settled UI after the real startup response; this checks the
    // final visible state, not every transient DOM mutation during loading.
    await expect(page.getByTestId("concierge-error-notice")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`guest-chat-${width}.png`) });
  });
}
