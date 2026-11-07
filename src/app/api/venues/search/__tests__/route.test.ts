import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Café/nightlife guest search is venue-anchor retrieval, not the restaurant catalogue.
 * These tests pin the contract the composer depends on: a real kind, truthful failures and
 * rows shaped like the ones the grounded-results list already renders.
 */
const cafeRows = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    kind: "cafe",
    name: "Moshi Café",
    google_place_id: "place-2",
    neighborhood: "El Poblado",
    latitude: 6.21,
    longitude: -75.57,
    tags: ["workspace"],
    metadata: null,
    is_active: true,
  },
  {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "cafe",
    name: "Rituales Compañía de Café",
    google_place_id: "place-1",
    neighborhood: "Laureles",
    latitude: 6.24,
    longitude: -75.59,
    tags: ["specialty"],
    metadata: null,
    is_active: true,
  },
];
const failures: { cafe: string | null; nightlife: string | null } = { cafe: null, nightlife: null };
const calls: Array<{ fn: string; params: unknown }> = [];

vi.mock("@/mastra/tools/search-venue-anchors", async () => {
  const actual = await vi.importActual<typeof import("@/mastra/tools/search-venue-anchors")>(
    "@/mastra/tools/search-venue-anchors",
  );
  return {
    ...actual,
    searchCafeVenueAnchorsForBrowse: async (params: unknown) => {
      calls.push({ fn: "cafe", params });
      return failures.cafe ? { rows: [], error: failures.cafe } : { rows: cafeRows, error: null };
    },
    searchNightclubVenueAnchorsForBrowse: async (params: unknown) => {
      calls.push({ fn: "nightlife", params });
      return failures.nightlife ? { rows: [], error: failures.nightlife } : { rows: [], error: null };
    },
  };
});

import { POST } from "../route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/venues/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

afterEach(() => {
  failures.cafe = null;
  failures.nightlife = null;
  calls.length = 0;
  vi.clearAllMocks();
});

describe("POST /api/venues/search", () => {
  it("returns grounded café rows in the shape the card list renders", async () => {
    const res = await post({ kind: "cafe", queryText: "quiet café in Laureles" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.kind).toBe("cafe");
    expect(json.total).toBe(1);
    expect(json.results[0]).toMatchObject({
      // The Laureles café, not the El Poblado one the query excluded.
      id: "11111111-1111-4111-8111-111111111111",
      title: "Rituales Compañía de Café",
      latitude: 6.24,
      longitude: -75.59,
      formattedAddress: "Laureles",
    });
  });

  it("routes nightlife to its own retrieval, never the café or restaurant one", async () => {
    await post({ kind: "nightlife", queryText: "salsa clubs in El Poblado", neighborhood: "El Poblado" });
    expect(calls.at(-1)?.fn).toBe("nightlife");
    expect(calls.at(-1)?.params).toMatchObject({ neighborhood: "El Poblado" });
  });

  it("rejects an unknown kind with 400", async () => {
    expect((await post({ kind: "restaurant" })).status).toBe(400);
  });

  it("rejects a missing or oversized query, and an oversized limit, with 400", async () => {
    expect((await post({ kind: "cafe", queryText: "" })).status).toBe(400);
    expect((await post({ kind: "cafe", queryText: "x".repeat(200) })).status).toBe(400);
    expect((await post({ kind: "cafe", limit: 99 })).status).toBe(400);
  });

  it("answers 503, not an empty list, when retrieval fails", async () => {
    failures.cafe = "Could not load cafés. Try again in a moment.";
    const res = await post({ kind: "cafe", queryText: "quiet" });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toContain("Could not load cafés");
    expect(json.results).toBeUndefined();
  });

  it("returns an honest empty result when retrieval succeeded with no matches", async () => {
    const res = await post({ kind: "nightlife", queryText: "nothing here" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([]);
    expect(json.total).toBe(0);
  });

  it("keeps only the rows the query actually describes", async () => {
    // The retrieval re-ranks, it does not filter; without this the copy would claim matches it
    // never made and "no matches" could never happen.
    const res = await post({ kind: "cafe", queryText: "quiet café in Laureles" });
    const json = await res.json();
    // Two candidates, one matches: the filter must actually exclude Moshi (El Poblado).
    expect(json.total).toBe(1);
    expect(json.results.map((r: { title: string }) => r.title)).toEqual([
      "Rituales Compañía de Café",
    ]);
  });

  it("returns a genuine empty result for a query nothing describes", async () => {
    const res = await post({ kind: "cafe", queryText: "zzz nowhere at all" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([]);
    expect(json.total).toBe(0);
  });

  it("does not filter when the query carries no venue signal", async () => {
    // "in the" are stopwords: an unfiltered query must not silently empty the page.
    const res = await post({ kind: "cafe", queryText: "in the" });
    const json = await res.json();
    expect(json.total).toBe(2);
  });

  it("matches Spanish venue names without accents and avoids false substring matches", async () => {
    const plain = await (await post({ kind: "cafe", queryText: "compania" })).json();
    expect(plain.results.map((r: { title: string }) => r.title)).toEqual(["Rituales Compañía de Café"]);

    const accented = await (await post({ kind: "cafe", queryText: "compañia" })).json();
    expect(accented.results.map((r: { title: string }) => r.title)).toEqual(["Rituales Compañía de Café"]);

    const short = await (await post({ kind: "cafe", queryText: "all" })).json();
    expect(short.results).toEqual([]);
  });

  it("rejects invalid json with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/venues/search", { method: "POST", body: "{not json" }),
    );
    expect(res.status).toBe(400);
  });
});
