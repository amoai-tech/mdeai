import { describe, expect, it } from "vitest";
import { rentalA2UIContextValue } from "../rental-a2ui-context";

const rows = [
  { id: "real-1", title: "Bright 2BR", neighborhood: "Laureles", nightly_price: 3_800_000, amenities: ["wifi"] },
  { id: "real-2", title: "Poblado Studio", neighborhood: "El Poblado", nightly_price: 4_500_000 },
];

describe("rental A2UI agent context", () => {
  it("publishes only the exact id and display labels", () => {
    const value = JSON.parse(rentalA2UIContextValue(rows));
    expect(value).toEqual(["real-1", "real-2"]);
    expect(JSON.stringify(value)).not.toContain("3_800_000");
    expect(JSON.stringify(value)).not.toContain("amenities");
  });

  it("caps the context and handles no results", () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      id: `id-${index}`,
      title: `Title ${index}`,
      neighborhood: "Laureles",
      nightly_price: 1,
    }));
    expect(JSON.parse(rentalA2UIContextValue(many))).toHaveLength(5);
    expect(JSON.parse(rentalA2UIContextValue(undefined))).toEqual([]);
  });
});
