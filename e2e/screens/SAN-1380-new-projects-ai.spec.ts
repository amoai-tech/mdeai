import { test, expect } from "@playwright/test";

/**
 * SAN-1380 — the AI search contract, proven through the running app rather than a unit mock.
 * The concierge's deterministic hard filters run before any narration, only published projects
 * are returned (RLS), and a missing fact is never turned into a value.
 */
test.describe("SAN-1380 new-projects AI search contract", () => {
  test("returns grounded, published project cards", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", { data: { limit: 10 } });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.totalPublished).toBeGreaterThan(0);
    expect(body.results.length).toBeGreaterThan(0);
    for (const card of body.results) {
      expect(card.detailUrl).toMatch(/^\/new-projects\//);
      expect(typeof card.priceLabel).toBe("string");
      expect(typeof card.priceKnown).toBe("boolean");
      expect(Array.isArray(card.unknownFields)).toBe(true);
      expect(card.priceLabel).not.toContain("COP 0");
      expect(JSON.stringify(card)).not.toContain("available");
    }
  });

  test("applies the neighborhood hard filter deterministically", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", {
      data: { neighborhood: "Laureles", limit: 10 },
    });
    const body = await res.json();
    expect(body.results.length).toBeGreaterThan(0);
    for (const card of body.results) {
      expect(card.neighborhood).toBe("Laureles");
    }
  });

  test("a price filter never matches a project with no published price", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", { data: { maxPriceCop: 1 } });
    const body = await res.json();
    expect(body.results).toHaveLength(0);
    expect(body.note).toContain("not guessed");
  });
});
