import { describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import {
  establishVercelAutomationBypass,
  establishVercelCandidateAccess,
  validateVercelCandidateOrigin,
} from "./vercel-bypass";

describe("Vercel candidate origin validation", () => {
  it("accepts the exact MDE deployment host pattern", () => {
    expect(validateVercelCandidateOrigin("https://mdeai-abc123-amoco.vercel.app").origin).toBe(
      "https://mdeai-abc123-amoco.vercel.app",
    );
  });

  it("accepts the MDE GitHub-attested amo-agency Vercel preview team", () => {
    const origin = "https://mdeai-git-test-san-755-guest-budget-ai-intent-7cf9fe-amo-agency.vercel.app";
    expect(validateVercelCandidateOrigin(origin).origin).toBe(origin);
  });


  for (const url of [
    "http://mdeai-abc123-amoco.vercel.app",
    "https://mdeai-abc123-amoco.vercel.app.attacker.example",
    "https://other-abc123-amoco.vercel.app",
    "https://other-abc123-amo-agency.vercel.app",
    "https://mdeai-abc123-amo-agency.vercel.app.attacker.example",
    "https://mdeai-abc123-unknown-team.vercel.app",
    "https://user:pass@mdeai-abc123-amoco.vercel.app",
    "https://mdeai-abc123-amoco.vercel.app:444",
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

const CANDIDATE = "https://mdeai-abc123-amoco.vercel.app";
const BYPASS_COOKIE = { name: "_vercel_jwt" };

describe("establishVercelAutomationBypass", () => {
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

describe("establishVercelCandidateAccess", () => {
  const expectedSha = "75ac8d9a9ad2daacdde6d61e6e020a152b2aeafb";
  const candidate = "https://mdeai-abc123-amo-agency.vercel.app";
  const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

  it("accepts only exact-SHA public MDE previews and sends no secret", async () => {
    const get = vi.fn().mockResolvedValue({
      status: () => 200,
      headers: () => jsonHeaders,
      json: async () => ({ sha: expectedSha, environment: "preview" }),
    });
    const page = { request: { get } } as unknown as Page;
    await establishVercelCandidateAccess(page, candidate, "must-not-send", expectedSha);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(candidate + "/api/version", {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
  });

  it("fails a public preview with a mismatched SHA", async () => {
    const get = vi.fn().mockResolvedValue({
      status: () => 200,
      headers: () => jsonHeaders,
      json: async () => ({ sha: "a".repeat(40) }),
    });
    const page = { request: { get } } as unknown as Page;
    await expect(establishVercelCandidateAccess(page, candidate, "secret", expectedSha))
      .rejects.toThrow(/commit differs from expected SHA/);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("requires a real bypass cookie for protected previews", async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ status: () => 302, headers: () => ({}) })
      .mockResolvedValueOnce({ status: () => 307 });
    const cookies = vi.fn().mockResolvedValue([{ name: "_vercel_jwt" }]);
    const page = {
      request: { get }, context: () => ({ cookies }),
    } as unknown as Page;
    await establishVercelCandidateAccess(page, candidate, "test-secret", expectedSha);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][0]).toBe(candidate + "/");
    expect(get.mock.calls[1][1].headers["x-vercel-protection-bypass"]).toBe("test-secret");
    expect(cookies).toHaveBeenCalledWith(candidate);
  });

  it("rejects malformed expected SHA before making requests", async () => {
    const get = vi.fn();
    const page = { request: { get } } as unknown as Page;
    await expect(establishVercelCandidateAccess(page, candidate, "secret", "bad"))
      .rejects.toThrow(/40 hexadecimal characters/);
    expect(get).not.toHaveBeenCalled();
  });
});
