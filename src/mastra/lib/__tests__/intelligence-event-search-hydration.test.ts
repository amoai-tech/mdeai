import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  embedQueryText: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("../query-embedding", () => ({
  embedQueryText: mocks.embedQueryText,
  vectorLiteral: vi.fn(() => "vector"),
}));

type Result = { data: unknown; error: { message: string } | null };

const builder = (result: Result) => {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "gte", "lte", "ilike", "in"]) b[m] = vi.fn(() => b);
  b.then = (ok?: (v: Result) => unknown, bad?: (r: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
  return b;
};

/** The 11 columns hybrid_search_events really returns: no coordinates, city, currency or maps link. */
const rpcRow = {
  id: "e-1",
  name: "Salsa Night",
  description: "live band",
  event_type: "music",
  address: "Calle 10 #43, Poblado",
  event_start_time: "2026-06-20T02:00:00.000Z",
  ticket_price_min: 25,
  rating: 4.5,
  primary_image_url: "https://example.com/i.jpg",
  tags: ["salsa"],
  similarity: 0.9,
};

const clientWith = (events: Result) => {
  const eventsBuilder = builder(events);
  return {
    client: {
      from: vi.fn((table: string) => (table === "events" ? eventsBuilder : builder({ data: [], error: null }))),
      rpc: vi.fn(() => Promise.resolve({ data: [rpcRow], error: null })),
    },
    eventsBuilder,
  };
};

describe("searchEventsIntelligent — hybrid results are completed from the event record", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    mocks.createClient.mockReset();
    mocks.embedQueryText.mockReset();
    mocks.embedQueryText.mockResolvedValue([0.1, 0.2]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("gives a semantic result its map coordinates, city, currency and maps link", async () => {
    const { client, eventsBuilder } = clientWith({
      data: [{ id: "e-1", city: "Medellín", currency: "USD", latitude: 6.21, longitude: -75.57, maps_url: "https://maps.example.com/x" }],
      error: null,
    });
    mocks.createClient.mockReturnValue(client);
    const { searchEventsIntelligent } = await import("../intelligence-event-search");

    const out = await searchEventsIntelligent({ queryText: "salsa tonight", limit: 5, dateWindow: "any" });

    expect(out.hybridUsed).toBe(true);
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ id: "e-1", latitude: 6.21, longitude: -75.57, currency: "USD", mapsUrl: "https://maps.example.com/x" });
    // one lookup for all ranked ids, not one per event
    expect(eventsBuilder.in).toHaveBeenCalledWith("id", ["e-1"]);
  });

  it("keeps the semantic result (without a pin) when the lookup fails", async () => {
    const { client } = clientWith({ data: null, error: { message: "boom" } });
    mocks.createClient.mockReturnValue(client);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { searchEventsIntelligent } = await import("../intelligence-event-search");

    const out = await searchEventsIntelligent({ queryText: "salsa tonight", limit: 5, dateWindow: "any" });

    expect(out.results).toHaveLength(1);
    expect(out.results[0].id).toBe("e-1");
    expect(out.results[0].latitude == null).toBe(true);
  });

  it("keeps semantic results if the hydration query rejects unexpectedly", async () => {
    const { client, eventsBuilder } = clientWith({ data: null, error: null });
    eventsBuilder.in = vi.fn(() => Promise.reject(new Error("network-down")));
    mocks.createClient.mockReturnValue(client);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { searchEventsIntelligent } = await import("../intelligence-event-search");

    const out = await searchEventsIntelligent({ queryText: "salsa tonight", limit: 5, dateWindow: "any" });

    expect(out.hybridUsed).toBe(true);
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ id: "e-1" });
    expect(out.results[0].latitude).toBeUndefined();
    expect(warning).toHaveBeenCalledWith(
      "[intelligence-event-search] event detail lookup rejected:", "network-down",
    );
    warning.mockRestore();
  });

  it("never overwrites what the RPC row already carries", async () => {
    const { client } = clientWith({
      data: [{ id: "e-1", city: "Bogotá", currency: "COP", latitude: 4.7, longitude: -74.0, maps_url: "https://other.example.com" }],
      error: null,
    });
    client.rpc = vi.fn(() => Promise.resolve({ data: [{ ...rpcRow, currency: "USD", latitude: 6.2, longitude: -75.5 }], error: null }));
    mocks.createClient.mockReturnValue(client);
    const { searchEventsIntelligent } = await import("../intelligence-event-search");

    const out = await searchEventsIntelligent({ queryText: "salsa tonight", limit: 5, dateWindow: "any" });

    expect(out.results[0]).toMatchObject({ currency: "USD", latitude: 6.2, longitude: -75.5 });
  });
});
