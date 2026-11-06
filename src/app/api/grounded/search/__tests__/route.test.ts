import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockServerClient } = vi.hoisted(() => ({
  mockServerClient: vi.fn(async () => ({ from: vi.fn() })),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mockServerClient }));

vi.mock("@/mastra/tools/search-grounded-places", () => ({
  searchGroundedPlacesTool: {
    execute: vi.fn(),
  },
}));

import { POST } from "../route";
import { searchGroundedPlacesTool } from "@/mastra/tools/search-grounded-places";

describe("POST /api/grounded/search", () => {
  beforeEach(() => {
    vi.mocked(searchGroundedPlacesTool.execute!).mockReset();
    mockServerClient.mockClear();
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
    expect(searchGroundedPlacesTool.execute).toHaveBeenCalledWith(
      expect.objectContaining({ nearbyRentalId, nearbyRadiusMeters: 800, intent: "cafe" }),
      expect.anything(),
    );
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
