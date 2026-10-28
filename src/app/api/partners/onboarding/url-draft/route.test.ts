import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, limiter, extract } = vi.hoisted(() => ({
  auth: vi.fn(),
  limiter: vi.fn(),
  extract: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: auth } }),
}));
vi.mock("@/lib/distributed-rate-limit", () => ({
  checkRateLimitDurable: limiter,
}));
vi.mock("@/lib/onboarding/extract-business-url", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onboarding/extract-business-url")>();
  return { ...actual, extractBusinessDraft: extract };
});

import { BusinessUrlExtractionError } from "@/lib/onboarding/extract-business-url";
import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/partners/onboarding/url-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("SAN-1193 url draft route", () => {
  beforeEach(() => {
    auth.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } } });
    limiter.mockReset().mockResolvedValue({
      allowed: true,
      storeAvailable: true,
      count: 1,
      max: 10,
      retryAfterSeconds: 0,
    });
    extract.mockReset().mockResolvedValue({
      businessName: "Café Central",
      category: "Café",
      sources: ["https://cafe.example.com"],
      unknownFields: [],
    });
  });

  it("requires an authenticated user", async () => {
    auth.mockResolvedValue({ data: { user: null } });
    expect((await post({ url: "https://cafe.example.com" })).status).toBe(401);
  });

  it("rejects unsafe or non-public URLs before any provider call", async () => {
    for (const url of ["ftp://example.com", "http://localhost:3000", "http://10.0.0.1"]) {
      expect((await post({ url })).status).toBe(400);
    }
    expect(extract).not.toHaveBeenCalled();
  });

  it("fails closed when the durable limiter is unavailable", async () => {
    limiter.mockResolvedValue({ allowed: true, storeAvailable: false });
    expect((await post({ url: "https://cafe.example.com" })).status).toBe(503);
  });

  it("returns 429 when the user exceeds the limit", async () => {
    limiter.mockResolvedValue({ allowed: false, storeAvailable: true });
    expect((await post({ url: "https://cafe.example.com" })).status).toBe(429);
  });

  it("returns a reviewed draft on success", async () => {
    const response = await post({ url: "cafe.example.com" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      draft: {
        businessName: "Café Central",
        category: "Café",
        sources: ["https://cafe.example.com"],
        unknownFields: [],
      },
    });
    expect(extract).toHaveBeenCalledWith("https://cafe.example.com/");
  });

  it("returns 422 when the page has no usable facts", async () => {
    extract.mockRejectedValue(
      new BusinessUrlExtractionError("invalid_output", "No business details"),
    );
    expect((await post({ url: "https://cafe.example.com" })).status).toBe(422);
  });

  it("returns 502 on provider failure instead of fake success", async () => {
    extract.mockRejectedValue(
      new BusinessUrlExtractionError("provider_failed", "upstream failed"),
    );
    expect((await post({ url: "https://cafe.example.com" })).status).toBe(502);
  });
});
