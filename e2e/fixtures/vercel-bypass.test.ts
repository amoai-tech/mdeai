import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import {
  establishVercelAutomationBypass,
  validateVercelCandidateOrigin,
  isVercelCandidateOrigin,
} from "./vercel-bypass";

describe("Vercel candidate origin validation", () => {
  it("never silently treats a rejected Vercel branch alias as production", () => {
    expect(isVercelCandidateOrigin("https://www.mdeai.co")).toBe(false);
    expect(isVercelCandidateOrigin("https://mdeai-abc123-amo-agency.vercel.app")).toBe(true);
    expect(() => isVercelCandidateOrigin(
      "https://mdeai-git-fix-qa-vercel-amo-agency-host-amo-agency.vercel.app",
    )).toThrow(/not trusted/);
    expect(() => isVercelCandidateOrigin(
      "https://mdeai-git-x-amo-agency.vercel.app",
    )).toThrow(/not trusted/);
  });

  it("accepts the exact MDE deployment host pattern", () => {
    expect(validateVercelCandidateOrigin("https://mdeai-abc123-amo-agency.vercel.app").origin).toBe(
      "https://mdeai-abc123-amo-agency.vercel.app",
    );
  });

  for (const url of [
    "https://mdeai-abc123-amoco.vercel.app",
    "https://mdeai-git-x-amo-agency.vercel.app",
    "https://mdeai-abc123-extra-amo-agency.vercel.app",
    "https://mdeai-abc123-agency.vercel.app",
    "https://mdeai-git-feature-amo-agency.vercel.app",
    "http://mdeai-abc123-amo-agency.vercel.app",
    "https://mdeai-abc123-amo-agency.vercel.app.attacker.example",
    "https://other-abc123-amo-agency.vercel.app",
    "https://user:pass@mdeai-abc123-amo-agency.vercel.app",
    "https://mdeai-abc123-amo-agency.vercel.app:444",
  ]) {
    it(`rejects untrusted candidate ${url}`, () => {
      expect(() => validateVercelCandidateOrigin(url)).toThrow();
    });
  }
});

type FakeCookie = { name: string };

/**
 * A fake Playwright page modelling the two surfaces the helper touches: the
 * setup request and the browser context's cookie jar. `cookieAfterSetup` is
 * what Vercel would have set in this context by the time the request returns.
 */
function fakePage(status: number, cookieAfterSetup: FakeCookie[] = []) {
  const get = vi.fn().mockResolvedValue({ status: () => status });
  const cookies = vi.fn().mockResolvedValue(cookieAfterSetup);
  const page = { request: { get }, context: () => ({ cookies }) } as unknown as Page;
  return { page, get, cookies };
}

const CANDIDATE = "https://mdeai-abc123-amo-agency.vercel.app";
const BYPASS_COOKIE = { name: "_vercel_jwt" };

const DEPLOYMENT_ID = "dpl_1234567890123456789012";
const SECRET = randomBytes(32).toString("hex");
const LOCAL_API_TOKEN = randomBytes(24).toString("hex");
const signedProof = (origin = CANDIDATE) => createHmac("sha256", SECRET).update([
  "mdeai-vercel-bypass-v1",
  "prj_iadSvJDW4MBqtQ5s3YPlBNc08it6",
  "team_PbKG2U0lCR67rN57C4fqcfaw",
  DEPLOYMENT_ID,
  origin,
].join("\n")).digest("hex");

beforeEach(() => {
  vi.stubEnv("MDE_QA_VERCEL_PROOF", signedProof());
  vi.stubEnv("MDE_QA_VERCEL_DEPLOYMENT_ID", DEPLOYMENT_ID);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("establishVercelAutomationBypass", () => {
  it("sends the secret only to candidate root with redirects disabled", async () => {
    const { page, get, cookies } = fakePage(200, [BYPASS_COOKIE]);

    await establishVercelAutomationBypass(page, CANDIDATE, SECRET);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(`${CANDIDATE}/`, {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: {
        "x-vercel-protection-bypass": SECRET,
        "x-vercel-set-bypass-cookie": "true",
      },
    });
    // The cookie lookup is scoped to the exact candidate origin.
    expect(cookies).toHaveBeenCalledWith(CANDIDATE);
  });

  it("passes when the bypass cookie is established, even on a redirect response", async () => {
    // Vercel answers the setup request with a redirect that carries Set-Cookie,
    // so a 3xx with the cookie present is success, not failure.
    const { page } = fakePage(307, [BYPASS_COOKIE]);
    await expect(
      establishVercelAutomationBypass(page, CANDIDATE, SECRET),
    ).resolves.toBeUndefined();
  });

  it("fails loudly when the secret is missing", async () => {
    const { page, get } = fakePage(200, [BYPASS_COOKIE]);
    await expect(establishVercelAutomationBypass(page, CANDIDATE, "")).rejects.toThrow(
      /bypass secret is required/i,
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("fails as an invalid target when the response is 200 but no bypass cookie was set", async () => {
    const { page } = fakePage(200, [{ name: "unrelated" }]);
    await expect(
      establishVercelAutomationBypass(page, CANDIDATE, SECRET),
    ).rejects.toThrow(/CERTIFICATION_TARGET_INVALID: Vercel bypass cookie was not established/);
  });

  it("fails on a 302 to the protection page when no cookie was set", async () => {
    // The exact false-pass this guard exists for: a 302 is < 400, so a
    // status-only check would accept it and every later request would measure
    // Vercel's login page.
    const { page } = fakePage(302);
    await expect(
      establishVercelAutomationBypass(page, CANDIDATE, SECRET),
    ).rejects.toThrow(/CERTIFICATION_TARGET_INVALID[\s\S]*returned 302/);
  });

  it("fails loudly when Vercel refuses bypass setup with 403", async () => {
    const { page } = fakePage(403);
    await expect(
      establishVercelAutomationBypass(page, CANDIDATE, SECRET),
    ).rejects.toThrow(/CERTIFICATION_TARGET_INVALID[\s\S]*returned 403/);
  });


  it("does not send the secret to an attacker origin with an MDE-looking suffix", async () => {
    const { page, get } = fakePage(200, [BYPASS_COOKIE]);
    await expect(establishVercelAutomationBypass(
      page, "https://mdeai-attacker7-amo-agency.vercel.app", SECRET,
    )).rejects.toThrow(/proof does not match candidate/);
    expect(get).not.toHaveBeenCalled();
  });

  it("fails closed for a forged or missing deployment proof", async () => {
    const { page, get } = fakePage(200, [BYPASS_COOKIE]);
    vi.stubEnv("MDE_QA_VERCEL_PROOF", "a".repeat(64));
    await expect(establishVercelAutomationBypass(page, CANDIDATE, SECRET))
      .rejects.toThrow(/proof does not match candidate/);
    vi.stubEnv("MDE_QA_VERCEL_PROOF", "");
    vi.stubEnv("MDE_QA_VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_TOKEN", "");
    await expect(establishVercelAutomationBypass(page, CANDIDATE, SECRET))
      .rejects.toThrow(/identity not verified/);
    expect(get).not.toHaveBeenCalled();
  });

  it("verifies the Vercel project and URL through the API for local QA", async () => {
    vi.stubEnv("MDE_QA_VERCEL_PROOF", "");
    vi.stubEnv("MDE_QA_VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_TOKEN", LOCAL_API_TOKEN);
    const lookup = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      deployments: [{ uid: DEPLOYMENT_ID, projectId: "prj_iadSvJDW4MBqtQ5s3YPlBNc08it6",
      accountId: "team_PbKG2U0lCR67rN57C4fqcfaw",
      url: "mdeai-abc123-amo-agency.vercel.app", readyState: "READY",
      }],
    }) });
    vi.stubGlobal("fetch", lookup);
    const { page, get } = fakePage(200, [BYPASS_COOKIE]);
    await expect(establishVercelAutomationBypass(page, CANDIDATE, SECRET)).resolves.toBeUndefined();
    expect(lookup).toHaveBeenCalledWith(
      expect.stringContaining("https://api.vercel.com/v6/deployments?projectId=prj_iadSvJDW4MBqtQ5s3YPlBNc08it6"),
      expect.objectContaining({ redirect: "error", headers: { authorization: `Bearer ${LOCAL_API_TOKEN}` } }),
    );
    expect(get).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(lookup.mock.calls)).not.toContain(SECRET);
  });

  it("denies a wrong Vercel project before browser requests or secret disclosure", async () => {
    vi.stubEnv("MDE_QA_VERCEL_PROOF", "");
    vi.stubEnv("MDE_QA_VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_TOKEN", LOCAL_API_TOKEN);
    const lookup = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      deployments: [{ uid: DEPLOYMENT_ID, projectId: "prj_attacker", accountId: "team_attacker",
      url: "mdeai-abc123-amo-agency.vercel.app", readyState: "READY",
      }],
    }) });
    vi.stubGlobal("fetch", lookup);
    const { page, get } = fakePage(200, [BYPASS_COOKIE]);
    await expect(establishVercelAutomationBypass(page, CANDIDATE, SECRET))
      .rejects.toThrow(/does not belong to the approved MDE project/);
    expect(get).not.toHaveBeenCalled();
    expect(JSON.stringify(lookup.mock.calls)).not.toContain(SECRET);
  });

    it("does not send the bypass secret if the project has no matching deployment", async () => {
    vi.stubEnv("MDE_QA_VERCEL_PROOF", "");
    vi.stubEnv("MDE_QA_VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_TOKEN", LOCAL_API_TOKEN);
    const lookup = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      deployments: [{ uid: DEPLOYMENT_ID,
        projectId: "prj_iadSvJDW4MBqtQ5s3YPlBNc08it6",
        url: "mdeai-other123-amo-agency.vercel.app", readyState: "READY",
      }],
    }) });
    vi.stubGlobal("fetch", lookup);
    const { page, get } = fakePage(200, [BYPASS_COOKIE]);
    await expect(establishVercelAutomationBypass(page, CANDIDATE, SECRET))
      .rejects.toThrow(/candidate deployment not found/);
    expect(lookup).toHaveBeenCalledWith(
      expect.stringContaining("api.vercel.com/v6/deployments?projectId="),
      expect.any(Object),
    );
    expect(JSON.stringify(lookup.mock.calls)).not.toContain(CANDIDATE);
    expect(get).not.toHaveBeenCalled();
  });

  it("verifies an older candidate on the second Vercel project page", async () => {
    vi.stubEnv("MDE_QA_VERCEL_PROOF", "");
    vi.stubEnv("MDE_QA_VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_TOKEN", LOCAL_API_TOKEN);
    const lookup = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        deployments: [{ uid: DEPLOYMENT_ID, url: "mdeai-other123-amo-agency.vercel.app" }],
        pagination: { next: 123456 },
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        deployments: [{ uid: DEPLOYMENT_ID, projectId: "prj_iadSvJDW4MBqtQ5s3YPlBNc08it6",
          accountId: "team_PbKG2U0lCR67rN57C4fqcfaw",
          url: "mdeai-abc123-amo-agency.vercel.app", readyState: "READY",
        }],
        pagination: { next: null },
      }) });
    vi.stubGlobal("fetch", lookup);
    const { page, get } = fakePage(200, [BYPASS_COOKIE]);
    await expect(establishVercelAutomationBypass(page, CANDIDATE, SECRET)).resolves.toBeUndefined();
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(new URL(lookup.mock.calls[1][0]).searchParams.get("until")).toBe("123456");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the Vercel API returns 403", async () => {
    vi.stubEnv("MDE_QA_VERCEL_PROOF", "");
    vi.stubEnv("MDE_QA_VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_TOKEN", LOCAL_API_TOKEN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const { page, get } = fakePage(200, [BYPASS_COOKIE]);
    await expect(establishVercelAutomationBypass(page, CANDIDATE, SECRET))
      .rejects.toThrow(/deployment identity lookup failed/);
    expect(get).not.toHaveBeenCalled();
  });

  it("fails on a server error before inspecting cookies", async () => {
    const { page, cookies } = fakePage(503, [BYPASS_COOKIE]);
    await expect(
      establishVercelAutomationBypass(page, CANDIDATE, SECRET),
    ).rejects.toThrow(/CERTIFICATION_TARGET_INVALID: bypass setup returned 503/);
    expect(cookies).not.toHaveBeenCalled();
  });
});
