import { describe, expect, it } from "vitest";
import { venueBookingRequestSchema } from "@/lib/venues/venue-booking-form-schema";

describe("venueBookingRequestSchema", () => {
  const valid = {
    venueKind: "cafe" as const,
    placeId: "ChIJabcdefghijklmnop",
    requestedAt: "2026-06-15T18:00:00.000Z",
    partySize: 2,
    contactName: "Camila",
    contactEmail: "camila@example.com",
  };

  it("accepts a minimal valid payload", () => {
    expect(venueBookingRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("normalizes a Gemini Medellín-local appointment, an explicit -05:00 offset and UTC to the same instant", () => {
    const samples = [
      "2026-11-15T19:00:00",
      "2026-11-15T19:00:00-05:00",
      "2026-11-16T00:00:00.000Z",
    ];
    for (const requestedAt of samples) {
      const parsed = venueBookingRequestSchema.safeParse({ ...valid, requestedAt });
      expect(parsed.success, requestedAt).toBe(true);
      if (parsed.success) expect(parsed.data.requestedAt).toBe("2026-11-16T00:00:00.000Z");
    }
  });

  it("rejects a model-supplied non-Medellín local offset rather than shifting the requested wall clock", () => {
    expect(venueBookingRequestSchema.safeParse({
      ...valid, requestedAt: "2026-11-15T19:00:00+02:00",
    }).success).toBe(false);
  });

  it("rejects malformed and impossible Medellín dates without interpreting browser time", () => {
    for (const requestedAt of ["2026-02-30T19:00:00", "tomorrow 7pm", "2026-11-15T25:00:00"])
      expect(venueBookingRequestSchema.safeParse({ ...valid, requestedAt }).success).toBe(false);
  });

  it("rejects invalid venue kind", () => {
    const result = venueBookingRequestSchema.safeParse({
      ...valid,
      venueKind: "nightlife",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short place id", () => {
    const result = venueBookingRequestSchema.safeParse({
      ...valid,
      placeId: "short",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an MDE restaurant UUID without a Google Place ID", () => {
    const { placeId: _discard, ...withoutPlaceId } = valid;
    void _discard;
    const result = venueBookingRequestSchema.safeParse({
      ...withoutPlaceId,
      venueKind: "restaurant",
      restaurantId: "a1b2c3d4-e5f6-4789-abcd-100000000005",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a restaurant with no Place ID and no canonical UUID", () => {
    const { placeId: _discard, ...withoutPlaceId } = valid;
    void _discard;
    expect(venueBookingRequestSchema.safeParse({ ...withoutPlaceId, venueKind: "restaurant" }).success).toBe(false);
  });

  it("still requires Place IDs for cafés and nightclubs", () => {
    const { placeId: _discard, ...withoutPlaceId } = valid;
    void _discard;
    expect(venueBookingRequestSchema.safeParse(withoutPlaceId).success).toBe(false);
    expect(venueBookingRequestSchema.safeParse({ ...withoutPlaceId, venueKind: "nightclub" }).success).toBe(false);
  });
});
