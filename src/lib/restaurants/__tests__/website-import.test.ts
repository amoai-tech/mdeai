import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ page: vi.fn(), model: vi.fn() }));
vi.mock("@/lib/web/safe-public-page-reader", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/web/safe-public-page-reader")>()),
  readPublicWebsite: mocks.page,
}));
vi.mock("@/lib/web/extract-website-json", () => ({ extractWebsiteJson: mocks.model }));

import {
  cleanDraftValue, extractRestaurantWebsiteDraft, parseDraftJson,
} from "@/lib/restaurants/website-import";

beforeEach(() => {
  mocks.page.mockReset().mockResolvedValue({
    requestedUrl: "https://cafe.example/", finalUrl: "https://cafe.example/menu",
    title: "Cafe Ejemplo", text: "Cafe Ejemplo offers coffee and pastries in Laureles.",
    retrievedAt: "2026-10-28T00:00:00Z",
  });
  mocks.model.mockReset().mockResolvedValue({
    name: "Cafe Ejemplo", description: "A neighbourhood cafe.",
    phone: null, price_level: 2, cuisine_types: ["Coffee", "Bakery"],
    unknownFields: ["email"], sources: ["https://fake.example"],
  });
});
afterEach(() => vi.restoreAllMocks());

describe("restaurant website extraction (SAN-1602)", () => {
  it("keeps the JSON and null clean-up helpers", () => {
    expect(parseDraftJson('Here: {"name":"Cafe"}')).toEqual({ name: "Cafe" });
    expect(parseDraftJson("no JSON")).toBeNull();
    expect(cleanDraftValue({ name: " Cafe ", phone: null, tags: [], empty: " " }))
      .toEqual({ name: "Cafe" });
  });

  it("rejects private URLs before any page/model request", async () => {
    await expect(extractRestaurantWebsiteDraft("http://127.0.0.1/admin"))
      .rejects.toMatchObject({ code: "invalid_url" });
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it("returns server-retrieved source, valid facts, and no invented citations", async () => {
    const draft = await extractRestaurantWebsiteDraft("https://cafe.example");
    expect(draft).toMatchObject({
      name: "Cafe Ejemplo", price_level: 2,
      cuisine_types: ["Coffee", "Bakery"],
      sources: ["https://cafe.example/menu"],
      retrievedAt: "2026-10-28T00:00:00Z",
    });
    expect(draft.phone).toBeUndefined();
    expect(mocks.model).toHaveBeenCalledWith(expect.objectContaining({
      finalUrl: "https://cafe.example/menu",
    }), "restaurant", expect.any(String));
  });

  it("rejects an output containing only an invented website", async () => {
    mocks.model.mockResolvedValue({ website: "https://fake.example" });
    await expect(extractRestaurantWebsiteDraft("https://cafe.example"))
      .rejects.toMatchObject({ code: "invalid_output" });
  });

  it("rejects fake publication/verification fields", async () => {
    mocks.model.mockResolvedValue({ name: "Cafe", verification_status: "verified" });
    await expect(extractRestaurantWebsiteDraft("https://cafe.example"))
      .rejects.toMatchObject({ code: "invalid_output" });
  });

  it("fails recoverably if no actual page could be retrieved", async () => {
    const { PublicWebsiteReadError } = await import("@/lib/web/safe-public-page-reader");
    mocks.page.mockRejectedValue(new PublicWebsiteReadError("timeout"));
    await expect(extractRestaurantWebsiteDraft("https://cafe.example"))
      .rejects.toMatchObject({ code: "timeout" });
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it("fails recoverably when NVIDIA is unavailable", async () => {
    mocks.model.mockRejectedValue(new Error("model 429"));
    await expect(extractRestaurantWebsiteDraft("https://cafe.example"))
      .rejects.toMatchObject({ code: "provider_failed" });
  });

  it("does not invent hours when page doesn't support them", async () => {
    const draft = await extractRestaurantWebsiteDraft("https://cafe.example");
    expect(draft.hours_of_operation).toBeUndefined();
  });
});
