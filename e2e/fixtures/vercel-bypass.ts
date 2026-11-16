import { createHmac, timingSafeEqual } from "node:crypto";
import type { Page } from "@playwright/test";

// Only immutable deployment URLs. A matching hostname is NOT proof of ownership.
const MDE_VERCEL_HOST = /^mdeai-[a-z0-9]{4,64}-amo-agency\.vercel\.app$/i;
const PROJECT_ID = "prj_iadSvJDW4MBqtQ5s3YPlBNc08it6";
const TEAM_ID = "team_PbKG2U0lCR67rN57C4fqcfaw";
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{20,}$/;

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

// No bypass secret leaves this process until Vercel confirms the exact deployment.
async function requireVerifiedDeployment(candidate: URL, secret: string): Promise<void> {
  // CI: the separate trusted main checkout verifies the Vercel project and URL,
  // then signs the exact candidate. The test receives a signature, not VERCEL_TOKEN.
  const proof = process.env.MDE_QA_VERCEL_PROOF?.trim() ?? "";
  const deploymentId = process.env.MDE_QA_VERCEL_DEPLOYMENT_ID?.trim() ?? "";
  if (proof || deploymentId) {
    if (!DEPLOYMENT_ID.test(deploymentId) || !/^[0-9a-f]{64}$/i.test(proof)) {
      throw new Error("CERTIFICATION_TARGET_INVALID: incomplete Vercel deployment proof");
    }
    const payload = ["mdeai-vercel-bypass-v1", PROJECT_ID, TEAM_ID, deploymentId, candidate.origin].join("\n");
    const expected = createHmac("sha256", secret).update(payload).digest();
    const supplied = Buffer.from(proof, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new Error("CERTIFICATION_TARGET_INVALID: Vercel deployment proof does not match candidate");
    }
    return;
  }

  // Local developer QA: use the read-only Vercel API lookup instead. Never send
  // the Vercel bearer token to the preview; only to api.vercel.com.
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    throw new Error("CERTIFICATION_TARGET_INVALID: Vercel deployment identity not verified (proof or VERCEL_TOKEN required)");
  }
  let response: Response;
  try {
    response = await fetch(
      "https://api.vercel.com/v13/deployments/" + encodeURIComponent(candidate.hostname) + "?teamId=" + TEAM_ID,
      { headers: { authorization: "Bearer " + token }, redirect: "error", signal: AbortSignal.timeout(12000) },
    );
  } catch {
    throw new Error("CERTIFICATION_TARGET_INVALID: Vercel deployment identity lookup failed");
  }
  if (!response.ok) {
    throw new Error("CERTIFICATION_TARGET_INVALID: Vercel deployment lookup returned " + response.status);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error("CERTIFICATION_TARGET_INVALID: invalid Vercel deployment identity response");
  }
  const deployment = raw as { id?: unknown; projectId?: unknown; accountId?: unknown; url?: unknown; readyState?: unknown };
  if (!deployment || typeof deployment.id !== "string" || !DEPLOYMENT_ID.test(deployment.id) ||
      deployment.projectId !== PROJECT_ID ||
      (deployment.accountId != null && deployment.accountId !== TEAM_ID) ||
      typeof deployment.url !== "string" || deployment.url.toLowerCase() !== candidate.hostname ||
      deployment.readyState !== "READY") {
    throw new Error("CERTIFICATION_TARGET_INVALID: Vercel deployment does not belong to the approved MDE project");
  }
}

export async function establishVercelAutomationBypass(
  page: Page,
  rawCandidateUrl: string,
  secret: string,
): Promise<void> {
  if (!secret.trim()) throw new Error("Vercel automation bypass secret is required");
  const candidate = validateVercelCandidateOrigin(rawCandidateUrl);
  await requireVerifiedDeployment(candidate, secret);
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
