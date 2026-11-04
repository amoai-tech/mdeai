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
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const response = await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    if (!response?.ok()) {
      throw new Error(`CI chat warm-up failed: HTTP ${response?.status() ?? "no response"}`);
    }

    // Browser-side chunk download, React hydration, resolved guest identity,
    // and real v2 composer readiness must all finish before E2E test clocks start.
    const region = page.getByTestId("copilot-chat-region");
    await region.waitFor({ state: "visible", timeout: 120_000 });
    const input = region.getByTestId("copilot-chat-textarea");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await expect(input).toBeEnabled({ timeout: 30_000 });

    console.log(`[e2e warm-up] /chat real mobile composer ready in ${Date.now() - started}ms`);
  } finally {
    await browser.close();
  }
}
