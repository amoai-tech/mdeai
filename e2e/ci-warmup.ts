/**
 * CI-only warm-up for Next.js development builds.
 *
 * Playwright detects when Next starts LISTENING, but on a cold runner the first
 * /chat request can spend ~40s compiling before the browser hydrates. That
 * compilation is infrastructure setup, not part of the 60s interaction contract.
 * Precompile the SAME real route once per CI lane before test timers begin.
 *
 * Never contact remote servers or activate on production smoke tests.
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
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
    throw new Error(`CI chat warm-up failed: HTTP ${response.status}`);
  }
  // Consume the entire streamed response: a status-200 header alone does not
  // prove that the server finished compiling and rendering the page.
  await response.arrayBuffer();
  console.log(`[e2e warm-up] /chat ready in ${Date.now() - started}ms`);
}
