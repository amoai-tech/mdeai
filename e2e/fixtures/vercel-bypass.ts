import type { Page } from "@playwright/test";

const MDE_VERCEL_HOST = /^mdeai-[a-z0-9-]+-amo-agency\.vercel\.app$/i;

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

  // Protected deployments set _vercel_jwt. An unprotected Vercel deployment
  // legitimately returns 200 without setting it. In that case, prove we can
  // reach the exact MDE candidate WITHOUT bypass headers or redirects.
  const cookies = await page.context().cookies(candidate.origin);
  const bypass = cookies.find((cookie) => cookie.name === "_vercel_jwt");
  if (bypass) return;

  const probe = await page.request.get(`${candidate.origin}/api/version`, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  const probeStatus = probe.status();
  let verifiedApp = false;
  if (probeStatus === 200 && probe.headers()["content-type"]?.includes("application/json")) {
    try {
      const data: unknown = await probe.json();
      if (data && typeof data === "object" && "sha" in data) {
        const sha = (data as { sha: unknown }).sha;
        const expectedSha = process.env.VERCEL_DEPLOYMENT_SHA?.trim();
        verifiedApp =
          typeof sha === "string" &&
          /^[a-f0-9]{40}$/.test(sha) &&
          (!expectedSha || sha === expectedSha);
      }
    } catch {
      // An HTML protection page (or malformed response) is never application proof.
    }
  }
  if (!verifiedApp) {
    throw new Error(
      `CERTIFICATION_TARGET_INVALID: Vercel bypass cookie was not established for ` +
        `${candidate.origin}. Setup returned ${status}; cookies present: ` +
        `${cookies.map((cookie) => cookie.name).join(", ") || "none"}. ` +
        `Unauthenticated app identity probe returned ${probeStatus}; ` +
        `the candidate cannot be certified without reaching MDE.`,
    );
  }
}
