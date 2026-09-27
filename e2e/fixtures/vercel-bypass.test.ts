import { describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import {
  establishVercelAutomationBypass,
  validateVercelCandidateOrigin,
} from "./vercel-bypass";

describe("Vercel candidate origin validation", () => {
  it("accepts the exact MDE deployment host pattern", () => {
    expect(validateVercelCandidateOrigin("https://mdeai-abc123-amoco.vercel.app").origin).toBe(
      "https://mdeai-abc123-amoco.vercel.app",
    );
  });

  for (const url of [
    "http://mdeai-abc123-amoco.vercel.app",
    "https://mdeai-abc123-amoco.vercel.app.attacker.example",
    "https://other-abc123-amoco.vercel.app",
    "https://user:pass@mdeai-abc123-amoco.vercel.app",
    "https://mdeai-abc123-amoco.vercel.app:444",
  ]) {
    it(`rejects untrusted candidate ${url}`, () => {
      expect(() => validateVercelCandidateOrigin(url)).toThrow();
    });
  }
});

describe("establishVercelAutomationBypass", () => {
  it("sends the secret only to candidate root with redirects disabled", async () => {
    const get = vi.fn().mockResolvedValue({ status: () => 200 });
    const page = { request: { get } } as unknown as Page;

    await establishVercelAutomationBypass(
      page,
      "https://mdeai-abc123-amoco.vercel.app",
      "test-secret",
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("https://mdeai-abc123-amoco.vercel.app/", {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: {
        "x-vercel-protection-bypass": "test-secret",
        "x-vercel-set-bypass-cookie": "true",
      },
    });
  });

  it("fails loudly when the secret is missing", async () => {
    const page = { request: { get: vi.fn() } } as unknown as Page;
    await expect(
      establishVercelAutomationBypass(page, "https://mdeai-abc123-amoco.vercel.app", ""),
    ).rejects.toThrow(/bypass secret is required/i);
  });

  it("fails loudly when Vercel refuses bypass setup", async () => {
    const get = vi.fn().mockResolvedValue({ status: () => 403 });
    const page = { request: { get } } as unknown as Page;
    await expect(
      establishVercelAutomationBypass(
        page,
        "https://mdeai-abc123-amoco.vercel.app",
        "test-secret",
      ),
    ).rejects.toThrow(/returned 403/i);
  });
});
