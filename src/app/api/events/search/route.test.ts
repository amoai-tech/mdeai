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
