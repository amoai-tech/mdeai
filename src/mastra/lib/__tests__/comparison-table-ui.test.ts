import { describe, expect, it } from "vitest";
import { buildComparisonTableOps, comparablePriceSummary, type ComparisonRow } from "../comparison-table-ui";

const row = (overrides: Partial<ComparisonRow> = {}): ComparisonRow => ({
  id: "37a05b09-f560-4776-92fd-b8bb2b92e601",
  title: "Laureles One",
  neighborhood: "Laureles",
  bedrooms: 2,
  bathrooms: 2,
  sizeSqm: 70,
  wifiSpeedMbps: 100,
  amenities: ["Balcony", "Elevator"],
  priceMonthly: 2_400_000,
  priceNightly: null,
  currency: "COP",
  ...overrides,
});
const second = () => row({
  id: "37a05b09-f560-4776-92fd-b8bb2b92e602",
  title: "El Poblado Two", neighborhood: "El Poblado", priceMonthly: 2_500_000,
});
function surface(rows: ComparisonRow[], replace = false) {
  const result = buildComparisonTableOps(rows, undefined, { replace })!;
  const op = result.operations.find((operation) => "createSurface" in operation) as {
    createSurface: { components: Array<Record<string, unknown>> };
  };
  return { result, components: op.createSurface.components };
}

describe("buildComparisonTableOps", () => {
  it("creates a real A2UI Column → Table, apartments as columns and facts as rows", () => {
    const { result, components } = surface([row(), second()]);
    expect(result.target).toBe("chat");
    expect(result.operations[0].version).toBe("1.0");
    expect(components[0]).toMatchObject({
      id: "root", component: "Column",
      children: ["comparison", "comparison-summary", "comparison-actions"],
    });
    expect(components[1]).toMatchObject({
      component: "Table",
      columns: ["Feature", "Laureles One", "El Poblado Two"],
      rows: expect.arrayContaining([
        ["Neighborhood", "Laureles", "El Poblado"],
        ["Bedrooms", "2", "2"],
        ["Bathrooms", "2", "2"],
        ["Area", "70 m²", "70 m²"],
        ["Monthly rent", "COP 2,400,000", "COP 2,500,000"],
        ["Nightly rent", "Not recorded", "Not recorded"],
      ]),
    });
    expect(components[2]).toMatchObject({ component: "Text" });
    expect(components[3]).toMatchObject({
      component: "RentalComparisonActions",
      listingIds: [row().id, second().id],
    });
    expect(JSON.stringify(result)).not.toContain('"Card"');
  });

  it("preserves BOTH actual rent periods and never divides monthly values by 30", () => {
    const both = row({ priceNightly: 85_000 });
    const { components } = surface([both, second()]);
    const table = components[1] as { rows: string[][] };
    expect(table.rows).toContainEqual(["Monthly rent", "COP 2,400,000", "COP 2,500,000"]);
    expect(table.rows).toContainEqual(["Nightly rent", "COP 85,000", "Not recorded"]);
    expect(JSON.stringify(table.rows)).not.toContain("80,000");
  });

  it("renders missing facts truthfully, including absent currencies and Wi-Fi", () => {
    const { components } = surface([
      row({ neighborhood: null, bedrooms: null, bathrooms: null, sizeSqm: null, wifiSpeedMbps: null, amenities: [], priceMonthly: null, currency: null }),
      second(),
    ]);
    const table = components[1] as { rows: string[][] };
    expect(table.rows).toContainEqual(["Wi-Fi speed", "Not recorded", "100 Mbps (listed)"]);
    expect(table.rows).toContainEqual(["Amenities", "Not recorded", "Balcony, Elevator"]);
    expect(table.rows).toContainEqual(["Monthly rent", "Not recorded", "COP 2,500,000"]);
    const unknownCurrency = surface([row({ currency: null }), second()]).components[1] as { rows: string[][] };
    expect(unknownCurrency.rows).toContainEqual(["Monthly rent", "2,400,000 (currency not recorded)", "COP 2,500,000"]);
  });

  it("keeps the comparison bounded at five apartments and caps amenity text", () => {
    const many = Array.from({ length: 7 }, (_, i) => row({
      id: String(i), title: `Listing ${i}`, amenities: ["WiFi", "Gym", "Sauna", "Pool", "Balcony"],
    }));
    const { components } = surface(many);
    const table = components[1] as { columns: string[]; rows: string[][] };
    expect(table.columns).toHaveLength(6);
    expect(table.rows).toHaveLength(8);
    expect(table.rows.find((r) => r[0] === "Amenities")?.[1]).toBe("WiFi, Gym, Sauna, Pool (+1 more)");
    expect((components[3] as { listingIds: string[] }).listingIds).toHaveLength(5);
  });

  it("routes a Rentals-page comparison to its mounted named surface", () => {
    expect(buildComparisonTableOps([row(), second()], undefined, { target: "rental-comparison" })?.target).toBe("rental-comparison");
  });

  it("replaces a previous surface rather than stacking tables", () => {
    const { result } = surface([row(), second()], true);
    expect(result.operations[0]).toMatchObject({
      version: "1.0", deleteSurface: { surfaceId: "comparison-table" },
    });
    expect(result.operations[1]).toMatchObject({ version: "1.0", createSurface: {} });
  });

  it("refuses a one-apartment comparison", () => {
    expect(buildComparisonTableOps([row()])).toBeNull();
  });
});

describe("comparablePriceSummary", () => {
  it("identifies a lower listed monthly price only for comparable currencies and complete data", () => {
    expect(comparablePriceSummary([row(), second()])).toContain("Laureles One at COP 2,400,000");
    expect(comparablePriceSummary([row(), second()])).toContain("not an overall recommendation");
  });
  it("does not rank mixed currencies, missing rates, or ties", () => {
    expect(comparablePriceSummary([row(), { ...second(), currency: "USD" }])).not.toContain("Lowest listed");
    expect(comparablePriceSummary([row({ priceMonthly: null }), second()])).not.toContain("Lowest listed");
    expect(comparablePriceSummary([row(), second(), row({ id: "tied", title: "Tied", priceMonthly: 2_400_000 })])).toContain("Lowest listed");
  });
});
