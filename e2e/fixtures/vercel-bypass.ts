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
  if (status < 200 || status >= 400) {
    throw new Error(`Vercel automation bypass setup returned ${status}`);
  }
}
