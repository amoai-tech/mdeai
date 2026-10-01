import type { Page } from "@playwright/test";

const MDE_VERCEL_HOST = /^mdeai-[a-z0-9-]+-amoco\.vercel\.app$/i;

export function validateVercelCandidateOrigin(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Vercel candidate must use https");
  if (url.username || url.password) throw new Error("Vercel candidate must not contain credentials");
  if (url.port) throw new Error("Vercel candidate must not contain an explicit port");
  if (!MDE_VERCEL_HOST.test(url.hostname)) throw new Error("Vercel candidate host is not trusted");
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Vercel candidate must be an origin-only URL");
  }
  return url;
}

export async function establishVercelAutomationBypass(
  page: Page,
  rawCandidateUrl: string,
  secret: string,
): Promise<void> {
  if (!secret.trim()) throw new Error("Vercel automation bypass secret is required");
  const candidate = validateVercelCandidateOrigin(rawCandidateUrl);
  const response = await page.request.get(`${candidate.origin}/`, {
    failOnStatusCode: false,
    maxRedirects: 0,
    headers: {
      "x-vercel-protection-bypass": secret,
      "x-vercel-set-bypass-cookie": "true",
    },
  });
  const status = response.status();
  if (status >= 500) {
    throw new Error(`CERTIFICATION_TARGET_INVALID: bypass setup returned ${status}`);
  }

  // The contract is NOT "the setup request returned < 400". A 302 to Vercel's
  // deployment-authentication page satisfies that while establishing nothing, and
  // every later request then 302s, follows, and is measured as a 200 application
  // response. The contract is that this browser context now owns the bypass cookie
  // for this exact origin.
  const cookies = await page.context().cookies(candidate.origin);
  const bypass = cookies.find((cookie) => cookie.name === "_vercel_jwt");

  if (!bypass) {
    throw new Error(
      `CERTIFICATION_TARGET_INVALID: Vercel bypass cookie was not established for ` +
        `${candidate.origin}. Setup returned ${status}; cookies present: ` +
        `${cookies.map((cookie) => cookie.name).join(", ") || "none"}. ` +
        `Without it, requests hit the deployment protection page and certification ` +
        `measures that instead of MDE.`,
    );
  }
}
