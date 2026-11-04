import { chromium, expect } from "@playwright/test";

/**
 * CI-only warm-up for the real /chat route and its browser-side JavaScript.
 *
 * Next.js development mode compiles client chunks lazily. Fetching /chat HTML
 * alone leaves app/chat/page.js and layout.js cold: on GitHub's mobile runner
 * they took 22–23 seconds to load, leaving almost no time for the real composer
 * to appear inside the test's 30-second visibility contract (run 41768579624).
 *
 * Use a real browser once before test timing starts. This compiles and hydrates
 * the same CopilotKit v2 composer the mobile suite will assert, without mocking
 * the runtime, bypassing guest auth, hitting production, or sleeping a fixed time.
 * It also detects an actually broken composer early instead of masking failure.
 */
export default async function warmUpCiChat() {
  if (process.env.PLAYWRIGHT_CI_WARMUP !== "1") return;

  const url = new URL("/chat", process.env.SMOKE_BASE_URL ?? "http://localhost:3002");
  if (
    process.env.NODE_ENV === "production" ||
    process.env.PW_SKIP_WEBSERVER === "1" ||
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  ) {
    throw new Error("CI chat warm-up must run only against a local development server");
  }

  const started = Date.now();
  // Three deterministic shards intentionally replace the real CopilotKit
  // provider with a local chat test adapter. There is no v2 composer to wait
  // for in that mode. Preserve their existing SSR-only preparation.
  if (process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT === "1") {
    const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) {
      throw new Error(`CI chat warm-up failed: HTTP ${response.status}`);
    }
    await response.arrayBuffer();
    console.log(`[e2e warm-up] deterministic /chat HTML ready in ${Date.now() - started}ms`);
    return;
  }

  const browser = await chromium.launch();
  try {
    // The real-composer suite checks both phone and desktop layouts. A mobile-only
    // warm-up left the first desktop navigation cold: run 41781676195 reached
    // HMR after ~22s and the desktop composer missed its 30s visibility window.
    // Precompile/hydrate both viewports instead of extending the assertion timeout.
    const viewports = [
      { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      { name: "desktop", viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false },
    ];

    for (const view of viewports) {
      const page = await browser.newPage({
        viewport: view.viewport,
        isMobile: view.isMobile,
        hasTouch: view.hasTouch,
      });
      try {
        const response = await page.goto(url.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
        if (!response?.ok()) {
          throw new Error(`CI ${view.name} chat warm-up failed: HTTP ${response?.status() ?? "no response"}`);
        }

        // Warm the genuine CopilotKit v2 composer, without a deterministic adapter
        // or auth bypass. A guest runtime-info 401 is expected in this lane.
        const region = page.getByTestId("copilot-chat-region");
        await region.waitFor({ state: "visible", timeout: 120_000 });
        const input = region.getByTestId("copilot-chat-textarea");
        await expect(input).toBeVisible({ timeout: 30_000 });
        await expect(input).toBeEnabled({ timeout: 30_000 });

        console.log(`[e2e warm-up] /chat real ${view.name} composer ready in ${Date.now() - started}ms`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
