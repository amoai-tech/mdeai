import { afterEach, describe, expect, it, vi } from "vitest";

import { submitVenueLead } from "@/lib/partners/submit-venue-lead";
import type { VenueLeadInput } from "@/lib/partners/venue-lead-schema";

const VALID_INPUT: VenueLeadInput = {
  requestId: "46ea2a21-795d-4c64-a58f-e1d87fd941c3",
  name: "Ana Café",
  email: "ana@example.com",
  venueName: "Café Central",
  venueType: "cafe",
  variant: "cafe",
};

function mockFetch(response: { ok: boolean; status: number; body: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitVenueLead", () => {
  it("rejects with the first readable validation message, not serialized JSON", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });

    await expect(
      submitVenueLead({ ...VALID_INPUT, email: "not-an-email" }),
    ).rejects.toThrow("Enter a valid email");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the API error message when the server rejects the lead", async () => {
    mockFetch({
      ok: false,
      status: 502,
      body: { success: false, error: { message: "Could not save your request" } },
    });

    await expect(submitVenueLead(VALID_INPUT)).rejects.toThrow(
      "Could not save your request",
    );
  });

  it("returns the persisted lead id on success", async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      body: { success: true, leadId: "lead-123", message: "Thanks" },
    });

    await expect(submitVenueLead(VALID_INPUT)).resolves.toEqual({
      leadId: "lead-123",
      message: "Thanks",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/partners/venue-leads",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
