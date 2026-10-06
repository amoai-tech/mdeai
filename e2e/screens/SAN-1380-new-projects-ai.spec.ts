import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * SAN-1380 — the AI search contract, proven through the running app. This is the deterministic
 * integration tier: the SAN-1404 pilot seed is a precondition, so zero published projects is a
 * FAILURE here, not a skip. (Empty-input shape is covered by the Vitest unit tests.)
 */
type SearchBody = {
  results: Array<Record<string, unknown>>;
  totalPublished?: number;
  note?: string;
  error?: { code?: string; issues?: unknown[] };
};

async function search(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ status: number; body: SearchBody }> {
  const res = await request.post("/api/new-projects/search", { data });
  const json = (await res.json()) as Partial<SearchBody>;
  return {
    status: res.status(),
    body: {
      results: Array.isArray(json.results) ? json.results : [],
      totalPublished: json.totalPublished,
      note: json.note,
      error: json.error,
    },
  };
}

function slugs(body: { results: Array<Record<string, unknown>> }): string[] {
  return body.results.map((card) => String(card.slug));
}

test.describe("SAN-1380 new-projects AI search contract", () => {
  test("returns a grounded response envelope from the seeded pilot", async ({ request }) => {
    const { status, body } = await search(request, { limit: 5 });
    expect(status).toBe(200);

    expect(Array.isArray(body.results)).toBe(true);
    expect(typeof body.totalPublished).toBe("number");
    expect(body.results.length).toBeLessThanOrEqual(5);

    // The pilot seed is a precondition in this environment.
    expect(body.totalPublished).toBeGreaterThan(0);
    expect(body.results.length).toBeGreaterThan(0);

    for (const card of body.results) {
      expect(String(card.detailUrl)).toMatch(/^\/new-projects\//);
      expect(typeof card.priceLabel).toBe("string");
      expect(typeof card.priceKnown).toBe("boolean");
      expect(Array.isArray(card.unknownFields)).toBe(true);
      expect(String(card.priceLabel)).not.toContain("COP 0");
      expect(JSON.stringify(card)).not.toContain("available");
    }
  });

  test("applies the neighborhood hard filter deterministically", async ({ request }) => {
    const { body } = await search(request, { neighborhood: "Laureles", limit: 5 });
    expect(body.results.length).toBeGreaterThan(0);
    for (const card of body.results) {
      expect(card.neighborhood).toBe("Laureles");
    }
  });

  test("a price filter never matches a project with no published price", async ({ request }) => {
    const { body } = await search(request, { maxPriceCop: 1 });
    expect(body.results).toHaveLength(0);
    expect(body.note).toContain("not guessed");
  });

  test("the delivery-unknown filter is expressible and honest", async ({ request }) => {
    const { status, body } = await search(request, { deliveryUnknown: true, limit: 5 });
    expect(status).toBe(200);
    for (const card of body.results) {
      expect(card.deliveryLabel).toBe("Delivery date not published");
    }
  });

  test("'2 bedroom' means exactly two, not two-or-more", async ({ request }) => {
    // Palma's recorded typologies are all 3BR, so it can match 3+ but not exact 3-as-2.
    const { body } = await search(request, { bedroomsExact: 2, limit: 5 });
    expect(slugs(body)).not.toContain("palma");
  });

  test("a combined bedroom+budget filter is correlated and fails closed on an unknown typology price", async ({ request }) => {
    // Arrayán has a 2BR typology but its price is not published. It may match exact-2 alone,
    // but must NOT match "2BR under 600M" when only its project price-from is known.
    const plain = await search(request, { bedroomsExact: 2, limit: 5 });
    expect(slugs(plain.body)).toContain("arrayan");

    const budgeted = await search(request, { bedroomsExact: 2, maxPriceCop: 600000000, limit: 5 });
    expect(slugs(budgeted.body)).not.toContain("arrayan");
  });

  test("seed precondition: the pilot exposes the typologies the next tests assert", async ({ request }) => {
    // Arrayán has a 2BR typology; Palma's recorded typologies are all 3BR. If the SAN-1404 seed
    // changes, this fails by name instead of the behavioural assertions failing confusingly.
    const exactTwo = await search(request, { bedroomsExact: 2, limit: 5 });
    const exactThree = await search(request, { bedroomsExact: 3, limit: 5 });
    expect(slugs(exactTwo.body)).toContain("arrayan");
    expect(slugs(exactThree.body)).toContain("palma");
    expect(slugs(exactTwo.body)).not.toContain("palma");
  });

  test("rejects invalid input with 400 and a stable error code", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", { data: { limit: 99 } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.issues)).toBe(true);
  });

  test("rejects an unknown field instead of silently ignoring it (strict schema)", async ({ request }) => {
    // A typo'd field must not validate and run a broader search than the caller asked for.
    const res = await request.post("/api/new-projects/search", { data: { maxPriceCOP: 600000000 } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("rejects contradictory bedroom filters with 400", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", {
      data: { bedroomsExact: 2, minBedrooms: 3 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("rejects a non-JSON body with 400 INVALID_JSON", async ({ request }) => {
    const res = await request.post("/api/new-projects/search", {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{not-json"),
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_JSON");
  });
});
