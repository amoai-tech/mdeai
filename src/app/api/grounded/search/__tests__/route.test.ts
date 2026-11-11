import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockServerClient, mockGetUser } = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockServerClient = vi.fn(async () => ({
    from: vi.fn(),
    auth: { getUser: mockGetUser },
  }));
  return { mockServerClient, mockGetUser };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: mockServerClient }));

vi.mock("@/mastra/tools/search-grounded-places", () => ({
  searchGroundedPlacesTool: {
    execute: vi.fn(),
  },
}));

import { POST } from "../route";
import { searchGroundedPlacesTool } from "@/mastra/tools/search-grounded-places";
import { MDEAI_TOOL_SPANS_KEY, MDEAI_USER_ID_KEY, recordToolSpan } from "@/mastra/lib/tool-audit-context";
import { RENTAL_SUPABASE_KEY } from "@/mastra/tools/search-rentals";

describe("POST /api/grounded/search", () => {
  beforeEach(() => {
    vi.mocked(searchGroundedPlacesTool.execute!).mockReset();
    mockServerClient.mockClear();
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: "signed-in-renter", is_anonymous: false } }, error: null });
  });

  it("returns grounded tool envelope", async () => {
    vi.mocked(searchGroundedPlacesTool.execute!).mockResolvedValue({
      results: [{ id: "a1", title: "Pergamino", latitude: 6.2, longitude: -75.5 }],
      attribution: [],
      source: "grounding",
    });

    const res = await POST(
      new Request("http://localhost/api/grounded/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "good specialty coffee in Laureles",
          neighborhood: "Laureles",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toHaveLength(1);
    expect(searchGroundedPlacesTool.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringMatching(/Laureles/i),
        pageSize: 5,
      }),
      expect.anything(),
    );
  });

  it("forwards intent nightlife to grounded tool", async () => {
    vi.mocked(searchGroundedPlacesTool.execute!).mockResolvedValue({
      results: [],
      attribution: [],
      source: "grounding",
    });

    const res = await POST(
      new Request("http://localhost/api/grounded/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "popular venues tonight in Provenza",
          intent: "nightlife",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(searchGroundedPlacesTool.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "nightlife",
        query: expect.stringMatching(/Provenza/i),
      }),
      expect.anything(),
    );
  });
  it("forwards selected rental identity to the canonical grounded tool", async () => {
    const nearbyRentalId = "550e8400-e29b-41d4-a716-446655440000";
    vi.mocked(searchGroundedPlacesTool.execute!).mockResolvedValue({
      results: [], attribution: [], source: "grounding",
      metadata: { searchMode: "nearby", anchorPinId: "rental-" + nearbyRentalId },
    });
    const res = await POST(new Request("http://localhost/api/grounded/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "cafés within 800 m of this apartment", intent: "cafe", nearbyRentalId, nearbyRadiusMeters: 800 }),
    }));
    expect(res.status).toBe(200);
    expect(mockServerClient).toHaveBeenCalledOnce();
    expect(mockGetUser).toHaveBeenCalledOnce();
    expect(searchGroundedPlacesTool.execute).toHaveBeenCalledWith(
      expect.objectContaining({ nearbyRentalId, nearbyRadiusMeters: 800, intent: "cafe" }),
      expect.anything(),
    );
    const callContext = vi.mocked(searchGroundedPlacesTool.execute!).mock.calls[0]?.[1] as unknown as {
      requestContext: { get(key: string): unknown };
    };
    expect(callContext.requestContext.get(MDEAI_USER_ID_KEY)).toBe("signed-in-renter");
    expect(callContext.requestContext.get(RENTAL_SUPABASE_KEY)).toHaveProperty("auth");
  });

  it("gives the tool a writable RequestContext so the span audit cannot 500 Nearby", async () => {
    const nearbyRentalId = "550e8400-e29b-41d4-a716-446655440000";
    vi.mocked(searchGroundedPlacesTool.execute!).mockResolvedValue({
      results: [], attribution: [], source: "grounding",
      metadata: { searchMode: "nearby", anchorPinId: `rental-${nearbyRentalId}`, reason: "nearby_provider_unavailable" },
    });
    const res = await POST(new Request("http://localhost/api/grounded/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "cafés", intent: "cafe", nearbyRentalId, nearbyRadiusMeters: 800 }),
    }));
    expect(res.status).toBe(200);
    const callContext = vi.mocked(searchGroundedPlacesTool.execute!).mock.calls[0]?.[1] as unknown as {
      requestContext: { get(key: string): unknown; set(key: string, value: unknown): void };
    };
    expect(typeof callContext.requestContext.set).toBe("function");
    // The exact production failure: recordToolSpan calls set() after the tool returns.
    expect(() => recordToolSpan(callContext, {
      tool: "search-grounded-places", ms: 1, status: "ok", ts: 1,
    })).not.toThrow();
    expect(callContext.requestContext.get(MDEAI_TOOL_SPANS_KEY)).toHaveLength(1);
  });

  it.each([
    ["guest with no session", { data: { user: null }, error: null }],
    ["failed auth validation", { data: { user: null }, error: { message: "invalid session" } }],
    ["anonymous Supabase identity", { data: { user: { id: "temporary", is_anonymous: true } }, error: null }],
  ])("rejects Nearby for %s before the billable tool runs", async (_label, auth) => {
    mockGetUser.mockResolvedValue(auth);
    const res = await POST(new Request("http://localhost/api/grounded/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "cafés near this apartment",
        intent: "cafe",
        nearbyRentalId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    }));
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "authentication_required" });
    expect(mockGetUser).toHaveBeenCalledOnce();
    expect(searchGroundedPlacesTool.execute).not.toHaveBeenCalled();
  });

  it("rejects fake listing IDs and oversized radii before invoking the provider", async () => {
    const res = await POST(new Request("http://localhost/api/grounded/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "cafés", nearbyRentalId: "fake", nearbyRadiusMeters: 90000 }),
    }));
    expect(res.status).toBe(400);
    expect(searchGroundedPlacesTool.execute).not.toHaveBeenCalled();
  });

});
