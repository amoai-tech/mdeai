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
        } else if (!isExpectedPublicPreviewVersion(data, expectedSha)) {
          failureReason = "candidate is not in preview environment";
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
        `${candidate.origin}. Setup returned ${status}; cookies present: ` +
        `${cookies.map((cookie) => cookie.name).join(", ") || "none"}. ` +
        `Unauthenticated app identity probe failed: ${failureReason} (HTTP ${probeStatus}); ` +
        `the candidate cannot be certified without reaching MDE.`,
    );
  }
}
