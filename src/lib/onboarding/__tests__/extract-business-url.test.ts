import { afterEach, describe, expect, it, vi } from "vitest";

import {
  businessUrlDraftSchema,
  extractBusinessDraft,
  parseDraftJson,
} from "../extract-business-url";

describe("business URL extraction parsing (SAN-1193)", () => {
  it("parses JSON wrapped in markdown or prose", () => {
    expect(
      parseDraftJson('Here you go:\n\n```json\n{"businessName":"Café Central"}\n```'),
    ).toEqual({ businessName: "Café Central" });
  });

  it("rejects text without JSON", () => {
    expect(parseDraftJson("I could not read that page.")).toBeNull();
    expect(parseDraftJson("{broken")).toBeNull();
  });

  it("accepts only known draft fields", () => {
    const parsed = businessUrlDraftSchema.safeParse({
      businessName: "Café Central",
      category: "Café",
      neighborhood: "Laureles",
      website: "https://cafe.example.com",
      description: "Specialty coffee.",
      sources: ["https://cafe.example.com"],
      unknownFields: ["openingHours"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-http website from the model", () => {
    expect(
      businessUrlDraftSchema.safeParse({
        businessName: "Café Central",
        website: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("rejects privileged or unknown model output", () => {
    expect(
      businessUrlDraftSchema.safeParse({ businessName: "Café", status: "active" }).success,
    ).toBe(false);
  });

  it("rejects a draft with no business details", () => {
    expect(businessUrlDraftSchema.safeParse({ sources: [] }).success).toBe(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockGemini(steps: unknown[]) {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ steps }),
      }),
    );
  }

  it("rejects invented citations when the provider did not retrieve the URL", async () => {
    mockGemini([
      {
        type: "model_output",
        content: [{
          type: "text",
          text: JSON.stringify({
            businessName: "Café Central",
            sources: ["https://fake-citation.example.com"],
          }),
        }],
      },
      {
        type: "url_context_result",
        result: [{ url: "https://cafe.example.com", status: "error" }],
      },
    ]);
    await expect(extractBusinessDraft("https://cafe.example.com")).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("returns only successfully retrieved provider URLs, not model-written URLs", async () => {
    mockGemini([
      {
        type: "model_output",
        content: [{
          type: "text",
          text: JSON.stringify({
            businessName: "Café Central",
            sources: ["https://made-up.example.com"],
          }),
        }],
      },
      {
        type: "url_context_result",
        result: [
          { url: "https://cafe.example.com", status: "success" },
          { url: "https://failed.example.com", status: "unsafe" },
        ],
      },
    ]);
    await expect(extractBusinessDraft("https://cafe.example.com")).resolves.toMatchObject({
      businessName: "Café Central",
      sources: ["https://cafe.example.com/"],
    });
  });
});
