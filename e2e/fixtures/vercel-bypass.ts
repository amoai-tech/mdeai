import { test as base, expect } from "@playwright/test";

/**
 * SAN-1330 — scoped Vercel automation bypass for staged certification.
 *
 * Vercel deployment URLs are SSO-protected (`ssoProtection:
 * all_except_custom_domains`), so pre-promotion certification runs against a
 * staged deployment that needs Protection Bypass for Automation.
 *
 * Why this is a fixture and not `use.extraHTTPHeaders`: Playwright applies
 * context-wide headers to **every** request the page makes. That would attach
 * this long-lived credential to third-party origins (Supabase, Google Maps,
 * CopilotKit) — leaking it outside Vercel — and cross-origin requests carrying
 * an unexpected header can fail preflight.
 *
 * Instead the header is applied only to requests whose URL matches the origin
 * under test, and Vercel's own bypass cookie (`x-vercel-set-bypass-cookie`)
 * authenticates subsequent same-origin requests.
 *
 * Specs that run against a staged deployment import `test` from here instead of
 * `@playwright/test`. Local and live-domain runs are unaffected: with no secret
 * set, this is a pass-through.
 */
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    if (bypassSecret && baseURL) {
      try {
        const origin = new URL(baseURL).origin;
        // A URL predicate, not a glob or a constructed RegExp. A glob
        // (`${origin}/**`) does not match the bare origin, so it silently skipped
        // the very first navigation — the one that must carry the bypass.
        await page.context().route(
          (url) => url.origin === origin,
          (route) =>
            route.continue({
              headers: {
                ...route.request().headers(),
                "x-vercel-protection-bypass": bypassSecret,
                "x-vercel-set-bypass-cookie": "true",
              },
            }),
        );
      } catch {
        // Unparseable baseURL: fall through and run without the bypass.
      }
    }
    await use(page);
  },
});

export { expect };
