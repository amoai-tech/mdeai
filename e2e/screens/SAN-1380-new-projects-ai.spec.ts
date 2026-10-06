import { test, expect } from "@playwright/test";

/**
 * SAN-1380 — the AI search contract, proven through the running app.
 * Shape is asserted unconditionally; only the content assertions need the seeded pilot, and they
 * skip (not fail) when this environment has no published projects, so an empty DB cannot turn
 * into a spurious red.
 */
test.describe("SAN-1380 new-projects AI search contract", () => {
  test("returns a grounded response envelope", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", { data: { limit: 5 } });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(Array.isArray(body.results)).toBe(true);
    expect(typeof body.totalPublished).toBe("number");
    expect(typeof body.returned).toBe("number");
    expect(body.results.length).toBeLessThanOrEqual(5);
    for (const card of body.results) {
      expect(card.detailUrl).toMatch(/^\/new-projects\//);
      expect(typeof card.priceLabel).toBe("string");
      expect(typeof card.priceKnown).toBe("boolean");
      expect(Array.isArray(card.unknownFields)).toBe(true);
      expect(card.priceLabel).not.toContain("COP 0");
      expect(JSON.stringify(card)).not.toContain("available");
    }

    test.skip(body.totalPublished === 0, "requires the seeded pilot projects in this environment");
    expect(body.results.length).toBeGreaterThan(0);
  });

  test("applies the neighborhood hard filter deterministically", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", {
      data: { neighborhood: "Laureles", limit: 5 },
    });
    const body = await res.json();
    for (const card of body.results) {
      expect(card.neighborhood).toBe("Laureles");
    }
    test.skip(body.totalPublished === 0, "requires the seeded pilot projects in this environment");
    expect(body.results.length).toBeGreaterThan(0);
  });

  test("a price filter never matches a project with no published price", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", { data: { maxPriceCop: 1 } });
    const body = await res.json();
    expect(body.results).toHaveLength(0);
    if (body.totalPublished > 0) {
      expect(body.note).toContain("not guessed");
    }
  });

  test("the delivery-unknown filter is expressible and honest", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", {
      data: { deliveryUnknown: true, limit: 5 },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const card of body.results) {
      expect(card.deliveryLabel).toBe("Delivery date not published");
    }
  });

  test("rejects invalid input with 400 and a stable error code", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", { data: { limit: 99 } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.issues)).toBe(true);
  });

  test("rejects a non-JSON body with 400 INVALID_JSON", async ({ request }) => {
    // A raw, malformed body (a buffer is sent verbatim; a plain string would be JSON-encoded).
    const res = await request.post("/api/new-projects/search", {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{not-json"),
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_JSON");
  });
});
