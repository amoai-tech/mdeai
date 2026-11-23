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

/** Never inject an authenticated MDE QA session into an arbitrary origin.
 * Accept only MDE's two canonical production domains or its exact named
 * Vercel deployment host (already checked by the existing candidate validator).
 */
export function validateMdeAuthenticatedQaOrigin(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("MDE authenticated QA target must be an HTTPS origin without credentials or URL extras");
  }
  if (url.hostname === "www.mdeai.co" || url.hostname === "mdeai.co") return url;
  return validateVercelCandidateOrigin(rawUrl);
}

/** Public previews do not issue a bypass cookie. Accept one only when its
 * live app version matches the exact expected Git commit and preview environment.
 * Protected previews must still use the existing cookie-verifying bypass path. */
export function isExpectedPublicPreviewVersion(value: unknown, expectedSha: string): boolean {
  if (!/^[a-f0-9]{40}$/i.test(expectedSha) || !value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const version = value as { sha?: unknown; environment?: unknown };
  return version.environment === "preview" && version.sha === expectedSha;
}

export async function establishVercelAutomationBypass(
  page: Page,
  rawCandidateUrl: string,
  secret: string,
  expectedEnvironment: "preview" | "production" = "preview",
): Promise<void> {
  const candidate = validateVercelCandidateOrigin(rawCandidateUrl);
  let setupStatus: number | "not requested" = "not requested";
  let cookieNames: string[] = [];

  // Only protected deployments need a bypass cookie. A public Vercel candidate
  // must instead prove the exact app SHA and environment before use.
  if (secret.trim()) {
    const response = await page.request.get(`${candidate.origin}/`, {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: {
        "x-vercel-protection-bypass": secret,
        "x-vercel-set-bypass-cookie": "true",
      },
    });
    setupStatus = response.status();
    if (setupStatus >= 500) {
      throw new Error(`CERTIFICATION_TARGET_INVALID: bypass setup returned ${setupStatus}`);
    }
    const cookies = await page.context().cookies(candidate.origin);
    cookieNames = cookies.map((cookie) => cookie.name);
    if (cookieNames.includes("_vercel_jwt")) return;
  }

  // No cookie/secret: reach the app without bypass headers or redirects.
  // A login page, wrong deployment SHA or unexpected environment must fail.
  const probe = await page.request.get(`${candidate.origin}/api/version`, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  const probeStatus = probe.status();
  let verifiedApp = false;
  let failureReason = `HTTP ${probeStatus}`;
  if (probeStatus === 200) {
    const contentType = probe.headers()["content-type"] ?? "missing";
    const mediaType = contentType.split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
      failureReason = `unexpected content-type ${contentType}`;
    } else {
      try {
        const data: unknown = await probe.json();
        const sha = data && typeof data === "object" && "sha" in data
          ? (data as { sha: unknown }).sha
          : undefined;
        const expectedSha = process.env.VERCEL_DEPLOYMENT_SHA?.trim() ?? "";
        if (typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha)) {
          failureReason = "invalid or missing app SHA";
        } else if (!/^[a-f0-9]{40}$/i.test(expectedSha)) {
          failureReason = "missing or invalid expected deployment SHA";
        } else if (sha !== expectedSha) {
          failureReason = `SHA mismatch: observed ${sha}, expected ${expectedSha}`;
        } else if (expectedEnvironment === "preview"
          ? !isExpectedPublicPreviewVersion(data, expectedSha)
          : (data as { environment?: unknown }).environment !== "production") {
          failureReason = `candidate is not in ${expectedEnvironment} environment`;
        } else {
          verifiedApp = true;
        }
      } catch {
        failureReason = "invalid JSON response";
      }
    }
  }
  if (!verifiedApp) {
    throw new Error(
      `CERTIFICATION_TARGET_INVALID: Vercel bypass cookie was not established for ` +
        `${candidate.origin}. Setup returned ${setupStatus}; cookies present: ` +
        `${cookieNames.join(", ") || "none"}. ` +
        `Unauthenticated app identity probe failed: ${failureReason} (HTTP ${probeStatus}); ` +
        `the candidate cannot be certified without reaching MDE.`,
    );
  }
}
