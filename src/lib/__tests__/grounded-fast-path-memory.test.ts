import { describe, expect, it } from "vitest";
import { groundedFastPathMemory } from "../grounded-fast-path-memory";

const RENTAL = "37a05b09-f560-4776-92fd-b8bb2b92e611";
const anchorPin = {
  id: `rental-${RENTAL}`,
  category: "rental",
  lat: 6.2503288,
  lng: -75.5915126,
};
const rows = [
  {
    id: "ChIJ-first-cup",
    title: "First Cup",
    latitude: 6.250994,
    longitude: -75.5911248,
  },
  {
    id: "ChIJ-punto-rico",
    title: "Cafetería Punto Rico",
    latitude: 6.2493503,
    longitude: -75.5910954,
  },
];

describe("groundedFastPathMemory", () => {
  it("selects the anchored rental and tags every distance with the same id", () => {
    const memory = groundedFastPathMemory({
      metadata: { searchMode: "nearby", anchorPinId: `rental-${RENTAL}` },
      results: rows,
      anchorPin,
      attribution: [],
    });
    expect(memory.selectedListingId).toBe(RENTAL);
    for (const row of memory.lastGroundedResults) {
      expect(row.distanceFromRentalId).toBe(RENTAL);
      expect(row.distanceMeters).toBeGreaterThan(0);
    }
    expect(memory.lastGroundedResults[0]?.distanceMeters).toBe(85);
  });

  it("rejects a different rental anchor instead of attributing distances incorrectly", () => {
    const memory = groundedFastPathMemory({
      metadata: { searchMode: "nearby", anchorPinId: "rental-other" },
      results: rows,
      anchorPin,
      attribution: [],
    });
    expect(memory).not.toHaveProperty("selectedListingId");
    expect(memory.lastGroundedResults.every((row) => !("distanceMeters" in row))).toBe(true);
  });

  it("never stores invalid or missing provider coordinates as a measurement", () => {
    const memory = groundedFastPathMemory({
      metadata: { searchMode: "nearby", anchorPinId: anchorPin.id },
      results: [
        rows[0],
        { ...rows[1], latitude: Number.NaN },
        { ...rows[1], id: "bad-range", longitude: -181 },
        { ...rows[1], id: "missing-location", latitude: undefined },
      ],
      anchorPin,
      attribution: [],
    });
    expect(memory.lastGroundedResults[0]?.distanceMeters).toBe(85);
    for (const row of memory.lastGroundedResults.slice(1)) {
      expect(row).not.toHaveProperty("distanceMeters");
      expect(row).not.toHaveProperty("distanceFromRentalId");
    }
  });

  it("does not attach distances to an invalid rental pin", () => {
    const memory = groundedFastPathMemory({
      metadata: { searchMode: "nearby", anchorPinId: anchorPin.id },
      results: rows,
      anchorPin: { ...anchorPin, lat: Number.NaN },
      attribution: [],
    });
    expect(memory).not.toHaveProperty("selectedListingId");
    expect(memory.lastGroundedResults[0]).not.toHaveProperty("distanceMeters");
  });

  it("does not select a listing for an independent grounded search", () => {
    const memory = groundedFastPathMemory({
      metadata: undefined,
      results: rows,
      anchorPin: undefined,
      attribution: [],
    });
    expect(memory).not.toHaveProperty("selectedListingId");
    expect(memory.lastGroundedResults[0]).not.toHaveProperty("distanceMeters");
  });
});
