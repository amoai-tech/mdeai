import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import {
  establishVercelAutomationBypass,
  isExpectedPublicPreviewVersion,
  validateVercelCandidateOrigin,
} from "./vercel-bypass";

describe("Vercel candidate origin validation", () => {
  it("accepts the exact MDE deployment host pattern", () => {
    expect(validateVercelCandidateOrigin("https://mdeai-abc123-amo-agency.vercel.app").origin).toBe(
      "https://mdeai-abc123-amo-agency.vercel.app",
    );
  });

  for (const url of [
    "https://mdeai-abc123-amoco.vercel.app",
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

describe("public preview version verification", () => {
  const expected = "e3c0ffbcb3da6fbd22e49d0a8250b7fd9a2d0eb6";
  it("accepts only a real MDE preview at the requested exact commit", () => {
    expect(isExpectedPublicPreviewVersion({ sha: expected, environment: "preview" }, expected)).toBe(true);
  });
  it.each([
    [{ sha: "0".repeat(40), environment: "preview" }, expected],
    [{ sha: expected, environment: "production" }, expected],
    [{ sha: expected }, expected],
    [{ sha: expected, environment: "preview" }, "short"],
    [null, expected],
    ["Vercel sign in", expected],
  ])("rejects wrong SHA, missing context or login HTML", (value, sha) => {
    expect(isExpectedPublicPreviewVersion(value, sha)).toBe(false);
  });
});

type FakeCookie = { name: string };

/**
 * A fake Playwright page modelling the two surfaces the helper touches: the
 * setup request and the browser context's cookie jar. `cookieAfterSetup` is
 * what Vercel would have set in this context by the time the request returns.
 */
function fakePage(
  status: number,
  cookieAfterSetup: FakeCookie[] = [],
  probe: {
    status: number;
    sha?: string;
    environment?: string;
    contentType?: string;
    body?: () => Promise<unknown>;
  } = { status: 302 },
) {
  const get = vi
    .fn()
    .mockResolvedValueOnce({ status: () => status })
    .mockResolvedValueOnce({
      status: () => probe.status,
      headers: () => ({ "content-type": probe.contentType ?? "application/json" }),
      json: probe.body ?? (async () => ({ sha: probe.sha, environment: probe.environment })),
    });
  const cookies = vi.fn().mockResolvedValue(cookieAfterSetup);
  const page = { request: { get }, context: () => ({ cookies }) } as unknown as Page;
  return { page, get, cookies };
}

const CANDIDATE = "https://mdeai-abc123-amo-agency.vercel.app";
const BYPASS_COOKIE = { name: "_vercel_jwt" };

describe("establishVercelAutomationBypass", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends the secret only to candidate root with redirects disabled", async () => {
    const { page, get, cookies } = fakePage(200, [BYPASS_COOKIE]);

    await establishVercelAutomationBypass(page, CANDIDATE, "test-secret");

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(`${CANDIDATE}/`, {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: {
        "x-vercel-protection-bypass": "test-secret",
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
      establishVercelAutomationBypass(page, CANDIDATE, "test-secret"),
    ).resolves.toBeUndefined();
  });

  it("fails loudly when the secret is missing", async () => {
    const { page, get } = fakePage(200, [BYPASS_COOKIE]);
    await expect(establishVercelAutomationBypass(page, CANDIDATE, "")).rejects.toThrow(
      /bypass secret is required/i,
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("accepts an unprotected deployment after an unauthenticated exact-app version probe", async () => {
    const sha = "a".repeat(40);
    vi.stubEnv("VERCEL_DEPLOYMENT_SHA", `  ${sha}  `);
    const { page, get } = fakePage(200, [], { status: 200, sha, environment: "preview" });
    await expect(establishVercelAutomationBypass(page, CANDIDATE, "test-secret")).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(2, `${CANDIDATE}/api/version`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
  });

  it("rejects an unprotected production identity even at the expected SHA", async () => {
    const sha = "a".repeat(40);
    vi.stubEnv("VERCEL_DEPLOYMENT_SHA", sha);
    const { page } = fakePage(200, [], { status: 200, sha, environment: "production" });
    await expect(establishVercelAutomationBypass(page, CANDIDATE, "test-secret"))
      .rejects.toThrow(/preview environment/);
  });

  it("rejects a public candidate without an explicitly expected deployment SHA", async () => {
    vi.stubEnv("VERCEL_DEPLOYMENT_SHA", "");
    const { page } = fakePage(200, [], { status: 200, sha: "a".repeat(40), environment: "preview" });
    await expect(establishVercelAutomationBypass(page, CANDIDATE, "test-secret"))
      .rejects.toThrow(/expected deployment SHA/);
  });

  it("rejects a different deployed SHA with a diagnostic reason", async () => {
    const expectedSha = "a".repeat(40);
    const observedSha = "b".repeat(40);
    vi.stubEnv("VERCEL_DEPLOYMENT_SHA", `  ${expectedSha}  `);
    const { page } = fakePage(200, [], { status: 200, sha: observedSha });

    await expect(establishVercelAutomationBypass(page, CANDIDATE, "test-secret"))
      .rejects.toThrow(`SHA mismatch: observed ${observedSha}, expected ${expectedSha}`);
  });

  it("rejects a non-MDE 200 response without a bypass cookie", async () => {
    const { page } = fakePage(200, [], { status: 200, sha: "not-a-commit" });
    await expect(establishVercelAutomationBypass(page, CANDIDATE, "test-secret"))
      .rejects.toThrow(/CERTIFICATION_TARGET_INVALID/);
  });

  it("rejects a JSON-impersonating protection page without a bypass cookie", async () => {
    const { page } = fakePage(200, [], {
      status: 200,
      sha: "a".repeat(40),
      contentType: "text/html",
    });
    await expect(establishVercelAutomationBypass(page, CANDIDATE, "test-secret"))
      .rejects.toThrow(/CERTIFICATION_TARGET_INVALID/);
  });

  it("rejects a media-type parameter that merely mentions application/json", async () => {
    const sha = "a".repeat(40);
    vi.stubEnv("VERCEL_DEPLOYMENT_SHA", sha);
    const { page } = fakePage(200, [], {
      status: 200,
      sha,
      contentType: 'text/plain; note="application/json"',
    });
    await expect(establishVercelAutomationBypass(page, CANDIDATE, "test-secret"))
      .rejects.toThrow(/unexpected content-type/);
  });

  it("accepts case-insensitive application/json with parameters", async () => {
    const sha = "a".repeat(40);
    vi.stubEnv("VERCEL_DEPLOYMENT_SHA", sha);
    const { page } = fakePage(200, [], {
      status: 200,
      sha,
      environment: "preview",
      contentType: "Application/JSON; charset=utf-8",
    });
    await expect(establishVercelAutomationBypass(page, CANDIDATE, "test-secret"))
      .resolves.toBeUndefined();
  });

  it("rejects malformed JSON from an unprotected candidate", async () => {
    const { page } = fakePage(200, [], {
      status: 200,
      body: async () => { throw new SyntaxError("Invalid JSON"); },
    });
    await expect(establishVercelAutomationBypass(page, CANDIDATE, "test-secret"))
      .rejects.toThrow(/invalid JSON response/);
  });

  for (const [name, body] of [
    ["null response", null],
    ["missing sha", {}],
  ] as const) {
    it(`rejects ${name} from an unprotected candidate`, async () => {
      const { page } = fakePage(200, [], { status: 200, body: async () => body });
      await expect(establishVercelAutomationBypass(page, CANDIDATE, "test-secret"))
        .rejects.toThrow(/invalid or missing app SHA/);
    });
  }

  it("fails as an invalid target when the response is 200 but no bypass cookie was set", async () => {
    const { page } = fakePage(200, [{ name: "unrelated" }]);
    await expect(
      establishVercelAutomationBypass(page, CANDIDATE, "test-secret"),
    ).rejects.toThrow(/CERTIFICATION_TARGET_INVALID: Vercel bypass cookie was not established/);
  });

  it("fails on a 302 to the protection page when no cookie was set", async () => {
    // The exact false-pass this guard exists for: a 302 is < 400, so a
    // status-only check would accept it and every later request would measure
    // Vercel's login page.
    const { page } = fakePage(302);
    await expect(
      establishVercelAutomationBypass(page, CANDIDATE, "test-secret"),
    ).rejects.toThrow(/CERTIFICATION_TARGET_INVALID[\s\S]*returned 302/);
  });

  it("fails loudly when Vercel refuses bypass setup with 403", async () => {
    const { page } = fakePage(403);
    await expect(
      establishVercelAutomationBypass(page, CANDIDATE, "test-secret"),
    ).rejects.toThrow(/CERTIFICATION_TARGET_INVALID[\s\S]*returned 403/);
  });

  it("fails on a server error before inspecting cookies", async () => {
    const { page, cookies } = fakePage(503, [BYPASS_COOKIE]);
    await expect(
      establishVercelAutomationBypass(page, CANDIDATE, "test-secret"),
    ).rejects.toThrow(/CERTIFICATION_TARGET_INVALID: bypass setup returned 503/);
    expect(cookies).not.toHaveBeenCalled();
  });
});
