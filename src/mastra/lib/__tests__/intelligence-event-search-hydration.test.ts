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
  for (const m of ["select", "eq", "order", "limit", "gte", "lte", "ilike", "in", "not", "or"]) b[m] = vi.fn(() => b);
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

const clientWith = (events: Result, fallback: Result = { data: [], error: null }) => {
  const eventsBuilder = builder(events);
  const structuredBuilder = builder(fallback);
  let eventsCalls = 0;
  return {
    client: {
      from: vi.fn((table: string) => table === "events"
        ? (++eventsCalls === 1 ? eventsBuilder : structuredBuilder)
        : builder({ data: [], error: null })),
      rpc: vi.fn(() => Promise.resolve({ data: [rpcRow], error: null })),
    },
    eventsBuilder,
    structuredBuilder,
  };
};

describe("searchEventsIntelligent — hybrid results are completed from the event record", () => {
  beforeEach(() => {
    // The fixture starts on June 20, 2026; keep it in the future so the
    // real hybrid date filter can run without depending on the wall clock.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-18T12:00:00.000Z"));
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    mocks.createClient.mockReset();
    mocks.embedQueryText.mockReset();
    mocks.embedQueryText.mockResolvedValue([0.1, 0.2]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("gives a semantic result its map coordinates, city, currency and maps link", async () => {
    const { client, eventsBuilder } = clientWith({
      data: [{ id: "e-1", city: "Medellín", currency: "USD", latitude: 6.21, longitude: -75.57, maps_url: "https://maps.example.com/x", slug: null }],
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

  const genuineEvent = {
    ...rpcRow, id: "real-event", name: "Genuine Salsa", slug: null,
    city: "Medellín", currency: "COP", latitude: null, longitude: null, maps_url: null,
  };

  it("falls back to filtered structured rows after a lookup error, excluding hidden QA slugs", async () => {
    const { client, structuredBuilder } = clientWith(
      { data: null, error: { message: "boom" } },
      { data: [genuineEvent], error: null },
    );
    mocks.createClient.mockReturnValue(client);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { searchEventsIntelligent } = await import("../intelligence-event-search");
    const out = await searchEventsIntelligent({ queryText: "salsa tonight", limit: 5, dateWindow: "any" });

    expect(out.hybridUsed).toBe(false);
    expect(out.results.map((row) => row.id)).toEqual(["real-event"]);
    expect(structuredBuilder.or).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back after rejected detail lookup without trusting unchecked rows", async () => {
    const { client, eventsBuilder } = clientWith(
      { data: null, error: null }, { data: [genuineEvent], error: null },
    );
    eventsBuilder.in = vi.fn(() => Promise.reject(new Error("network-down")));
    mocks.createClient.mockReturnValue(client);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { searchEventsIntelligent } = await import("../intelligence-event-search");
    const out = await searchEventsIntelligent({ queryText: "salsa tonight", limit: 5, dateWindow: "any" });

    expect(out.hybridUsed).toBe(false);
    expect(out.results.map((row) => row.id)).toEqual(["real-event"]);
    expect(warn).toHaveBeenCalledWith(
      "[intelligence-event-search] event detail lookup rejected:", "network-down",
    );
    warn.mockRestore();
  });

  it.each([
    ["missing ID", []],
    ["missing slug property", [{ id: "e-1" }]],
  ])("uses structured fallback when lookup is incomplete: %s", async (_reason, details) => {
    const { client } = clientWith({ data: details, error: null }, { data: [genuineEvent], error: null });
    mocks.createClient.mockReturnValue(client);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { searchEventsIntelligent } = await import("../intelligence-event-search");
    const out = await searchEventsIntelligent({ queryText: "salsa tonight", limit: 5, dateWindow: "any" });
    expect(out.hybridUsed).toBe(false);
    expect(out.results.map((row) => row.id)).toEqual(["real-event"]);
    warn.mockRestore();
  });

  it("preserves a confirmed NULL slug as a legitimate semantic event", async () => {
    const { client } = clientWith({ data: [{ id: "e-1", slug: null }], error: null });
    mocks.createClient.mockReturnValue(client);
    const { searchEventsIntelligent } = await import("../intelligence-event-search");
    const out = await searchEventsIntelligent({ queryText: "salsa tonight", limit: 5, dateWindow: "any" });
    expect(out.hybridUsed).toBe(true);
    expect(out.results.map((row) => row.id)).toEqual(["e-1"]);
  });

  it("filters a harmless title with qa-prefixed slug after successful hydration", async () => {
    const { client } = clientWith({ data: [{ id: "e-1", slug: "qa-hidden-fixture" }], error: null }, { data: [genuineEvent], error: null });
    mocks.createClient.mockReturnValue(client);
    const { searchEventsIntelligent } = await import("../intelligence-event-search");
    const out = await searchEventsIntelligent({ queryText: "salsa tonight", limit: 5, dateWindow: "any" });
    expect(out.hybridUsed).toBe(false);
    expect(out.results.map((row) => row.id)).toEqual(["real-event"]);
  });

  it("never overwrites what the RPC row already carries", async () => {
    const { client } = clientWith({
      data: [{ id: "e-1", city: "Bogotá", currency: "COP", latitude: 4.7, longitude: -74.0, maps_url: "https://other.example.com", slug: null }],
      error: null,
    });
    client.rpc = vi.fn(() => Promise.resolve({ data: [{ ...rpcRow, currency: "USD", latitude: 6.2, longitude: -75.5 }], error: null }));
    mocks.createClient.mockReturnValue(client);
    const { searchEventsIntelligent } = await import("../intelligence-event-search");

    const out = await searchEventsIntelligent({ queryText: "salsa tonight", limit: 5, dateWindow: "any" });

    expect(out.results[0]).toMatchObject({ currency: "USD", latitude: 6.2, longitude: -75.5 });
  });
});
