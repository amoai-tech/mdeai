import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchEventsMock } = vi.hoisted(() => ({
  searchEventsMock: vi.fn(),
}));

vi.mock("@/mastra/tools/search-events", () => ({
  searchEvents: searchEventsMock,
}));
vi.mock("@/lib/api-ip-rate-limit", () => ({
  checkSearchFastPathRateLimit: () => null,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>): Request {
  return new Request("https://www.mdeai.co/api/events/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("event search API — explicit vs inferred date", () => {
  beforeEach(() => {
    searchEventsMock.mockReset();
    searchEventsMock.mockResolvedValue({
      results: [], total: 0, source: "supabase",
      hybridUsed: false, rankExplanation: [],
    });
  });

  it("leaves date unspecified so natural-language tonight/weekend can be inferred", async () => {
    const response = await POST(request({
      queryText: "salsa events in Laureles this weekend",
      limit: 5,
    }));
    expect(response.status).toBe(200);
    expect(searchEventsMock).toHaveBeenCalledWith(expect.objectContaining({
      queryText: "salsa events in Laureles this weekend",
    }));
    expect(searchEventsMock.mock.calls[0]?.[0].dateWindow).toBeUndefined();
  });

  it("preserves an explicit show-all override", async () => {
    await POST(request({ queryText: "tonight", dateWindow: "any" }));
    expect(searchEventsMock.mock.calls[0]?.[0].dateWindow).toBe("any");
  });

  it("preserves an explicit tonight choice", async () => {
    await POST(request({ queryText: "salsa", dateWindow: "tonight" }));
    expect(searchEventsMock.mock.calls[0]?.[0].dateWindow).toBe("tonight");
  });
});

describe("SAN-1701 · event search provider truth", () => {
  beforeEach(() => searchEventsMock.mockReset());

  it("returns HTTP 503, not an empty-market success, on unavailable provider", async () => {
    searchEventsMock.mockResolvedValue({ results: [], total: 0, source: "unavailable" });
    const response = await POST(request({ queryText: "salsa in Laureles", limit: 5 }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "event_search_unavailable",
      message: "Event search is temporarily unavailable.",
    });
  });

  it("keeps a genuine zero-result search as HTTP 200", async () => {
    searchEventsMock.mockResolvedValue({ results: [], total: 0, source: "supabase" });
    const response = await POST(request({ queryText: "salsa in Laureles", limit: 5 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      results: [], total: 0, source: "supabase",
    });
  });

  it("preserves canonical event ID, date, currency, price and availability", async () => {
    const sourceRow = {
      id: "grounded-event-123",
      title: "Salsa in Laureles",
      startsAt: "2026-12-11T23:00:00Z",
      pricePerTicket: 80000,
      currency: "COP",
      canBuyTickets: true,
      venue: "Source-backed venue",
      neighborhood: "Laureles",
      category: "nightlife",
      imageUrl: "",
    };
    searchEventsMock.mockResolvedValue({
      results: [sourceRow], total: 1, source: "supabase",
    });
    const response = await POST(request({ queryText: "salsa in Laureles", limit: 5 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([sourceRow]);
    expect(body.total).toBe(1);
    expect(body.source).toBe("supabase");
    expect(searchEventsMock).toHaveBeenCalledWith(expect.objectContaining({
      queryText: "salsa in Laureles", limit: 5,
    }));
  });
});
