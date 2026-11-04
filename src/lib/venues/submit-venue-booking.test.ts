import { describe, expect, it, vi, afterEach } from "vitest";
import { submitVenueBooking } from "@/lib/venues/submit-venue-booking";

const payload = {
  venueKind: "cafe" as const,
  placeId: "ChIJabcdefghijklmnop",
  requestedAt: "2026-06-15T18:00:00.000Z",
  partySize: 2,
  contactName: "Camila",
  contactEmail: "camila@example.com",
};

describe("submitVenueBooking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { success: false, error: { message: "Sign in" } },
          { status: 401 },
        ),
      ),
    );

    await expect(submitVenueBooking(payload)).rejects.toThrow(/Sign in/);
  });

  it("returns request id on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          requestId: "abc-123",
          message: "Request sent — awaiting confirmation from the venue.",
        }),
      ),
    );

    const result = await submitVenueBooking(payload);
    expect(result.requestId).toBe("abc-123");
    expect(result.message).toContain("awaiting confirmation");
    expect(result.message).not.toContain("WhatsApp");
  });

  it("uses truthful pending copy when the API has no custom message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: true, requestId: "abc-123" })),
    );

    const result = await submitVenueBooking(payload);
    expect(result.message).toMatch(/awaiting confirmation from the venue/i);
    expect(result.message).not.toMatch(/WhatsApp|confirmed reservation/i);
  });

  it("throws on server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { success: false, error: { message: "Could not save" } },
          { status: 500 },
        ),
      ),
    );

    await expect(submitVenueBooking(payload)).rejects.toThrow(/Could not save/);
  });
});
