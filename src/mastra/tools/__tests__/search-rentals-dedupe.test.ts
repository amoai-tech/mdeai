import { describe, expect, it } from "vitest";
import { dedupeBySourceIdentity } from "../search-rentals";

describe("dedupeBySourceIdentity — exact source identity only (SAN-1235)", () => {
  it("collapses two re-imports of the same source record", () => {
    const rows = [
      { id: "a", metadata: { san1503_import_key: "unit-a" } },
      { id: "b", metadata: { san1503_import_key: "unit-a" } },
    ];
    expect(dedupeBySourceIdentity(rows).map((r) => r.id)).toEqual(["a"]);
  });

  it("keeps two units in the same building separate", () => {
    const shared = { neighborhood: "Laureles", latitude: 6.24, longitude: -75.58, price: 2_400_000 };
    const rows = [
      { id: "unit-201", metadata: { ...shared, san1503_import_key: "casacol-201" } },
      { id: "unit-202", metadata: { ...shared, san1503_import_key: "casacol-202" } },
    ];
    expect(dedupeBySourceIdentity(rows).map((r) => r.id)).toEqual(["unit-201", "unit-202"]);
  });

  it("does not merge two different records that merely share an address", () => {
    const rows = [
      { id: "x", metadata: { unit_address: "Calle 10 #42-15" } },
      { id: "y", metadata: { unit_address: "Calle 10 #42-15" } },
    ];
    expect(dedupeBySourceIdentity(rows).map((r) => r.id)).toEqual(["x", "y"]);
  });

  it("tolerates a missing or blank import key and preserves order", () => {
    const rows = [
      { id: "1", metadata: null },
      { id: "2", metadata: { san1503_import_key: "   " } },
      { id: "3" },
    ];
    expect(dedupeBySourceIdentity(rows).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});
