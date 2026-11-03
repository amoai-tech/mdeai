import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ page: vi.fn(), model: vi.fn() }));
vi.mock("@/lib/web/safe-public-page-reader", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/web/safe-public-page-reader")>()),
  readPublicWebsite: mocks.page,
}));
vi.mock("@/lib/web/extract-website-json", () => ({ extractWebsiteJson: mocks.model }));

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

  beforeEach(() => {
    mocks.page.mockReset().mockResolvedValue({
      requestedUrl: "https://cafe.example.com/", finalUrl: "https://cafe.example.com/about",
      title: "Café Central", text: "Café Central serves specialty coffee in Laureles.",
      retrievedAt: "2026-10-28T00:00:00Z",
    });
    mocks.model.mockReset().mockResolvedValue({
      businessName: "Café Central", category: "Café", neighborhood: "Laureles",
      description: "Specialty coffee", sources: ["https://fake-citation.example"],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns only actually retrieved source URLs, never model-written citations", async () => {
    await expect(extractBusinessDraft("https://cafe.example.com")).resolves.toMatchObject({
      businessName: "Café Central",
      website: "https://cafe.example.com/about",
      sources: ["https://cafe.example.com/about"],
    });
    expect(mocks.model).toHaveBeenCalledTimes(1);
    expect(mocks.model).toHaveBeenCalledWith(expect.objectContaining({
      finalUrl: "https://cafe.example.com/about",
    }), "partner", expect.any(String));
  });

  it("does not accept a bare website as extracted business detail", async () => {
    mocks.model.mockResolvedValue({ website: "https://fake-citation.example" });
    await expect(extractBusinessDraft("https://cafe.example.com")).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("returns recoverable failure when public website is unavailable", async () => {
    const { PublicWebsiteReadError } = await import("@/lib/web/safe-public-page-reader");
    mocks.page.mockRejectedValue(new PublicWebsiteReadError("unavailable"));
    await expect(extractBusinessDraft("https://cafe.example.com")).rejects.toMatchObject({
      code: "provider_failed",
    });
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it("rejects privileged model keys even when page was actually fetched", async () => {
    mocks.model.mockResolvedValue({ businessName: "Cafe", status: "approved" });
    await expect(extractBusinessDraft("https://cafe.example.com")).rejects.toMatchObject({
      code: "invalid_output",
    });
  });
});
