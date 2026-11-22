import { describe, expect, it } from "vitest";
import { buildComparisonTableOps, comparablePriceSummary, type ComparisonRow } from "../comparison-table-ui";

const row = (overrides: Partial<ComparisonRow> = {}): ComparisonRow => ({
  id: "37a05b09-f560-4776-92fd-b8bb2b92e601",
  title: "Laureles One",
  neighborhood: "Laureles",
  bedrooms: 2,
  furnished: true,
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
  title: "El Poblado Two", neighborhood: "El Poblado", furnished: false, priceMonthly: 2_500_000,
});
function surface(rows: ComparisonRow[], replace = false) {
  const result = buildComparisonTableOps(rows, undefined, { replace })!;
  const op = result.operations.find((operation) => "createSurface" in operation) as {
    createSurface: { components: Array<Record<string, unknown>> };
  };
  const components = op.createSurface.components;
  const component = (id: string) => {
    const found = components.find((item) => item.id === id);
    expect(found, `Missing component ${id}`).toBeDefined();
    return found!;
  };
  return { result, components, component };
}

describe("buildComparisonTableOps", () => {
  it("creates a real A2UI Column → Table, apartments as columns and facts as rows", () => {
    const { result, components, component } = surface([row(), second()]);
    expect(result.target).toBe("chat");
    expect(result.operations[0].version).toBe("1.0");
    expect(components[0]).toMatchObject({
      id: "root", component: "Column",
      children: ["comparison-heading", "comparison", "comparison-summary", "comparison-note", "comparison-actions"],
    });
    expect(component("comparison-heading")).toMatchObject({
      component: "Row", children: ["comparison-title", "comparison-badge"],
    });
    expect(component("comparison-title")).toMatchObject({ component: "Title", text: "Compare 2 apartments" });
    expect(component("comparison-badge")).toMatchObject({ component: "Badge", label: "Recorded details" });
    expect(component("comparison")).toMatchObject({
      component: "Table",
      columns: ["Feature", "Laureles One", "El Poblado Two"],
      rows: expect.arrayContaining([
        ["Neighborhood", "Laureles", "El Poblado"],
        ["Bedrooms", "2", "2"],
        ["Furnished", "Yes", "No"],
        ["Bathrooms", "2", "2"],
        ["Area", "70 m²", "70 m²"],
        ["Monthly rent", "COP 2,400,000", "COP 2,500,000"],
        ["Nightly rent", "Not recorded", "Not recorded"],
      ]),
    });
    expect(component("comparison-summary")).toMatchObject({ component: "Text" });
    expect(component("comparison-note")).toMatchObject({
      component: "Caption", text: expect.stringContaining("Monthly and nightly"),
    });
    expect(component("comparison-actions")).toMatchObject({
      component: "RentalComparisonActions",
      listingIds: [row().id, second().id],
    });
    expect(JSON.stringify(result)).not.toContain('"Card"');
  });

  it("preserves BOTH actual rent periods and never divides monthly values by 30", () => {
    const both = row({ priceNightly: 85_000 });
    const { component } = surface([both, second()]);
    const table = component("comparison") as { rows: string[][] };
    expect(table.rows).toContainEqual(["Monthly rent", "COP 2,400,000", "COP 2,500,000"]);
    expect(table.rows).toContainEqual(["Nightly rent", "COP 85,000", "Not recorded"]);
    expect(JSON.stringify(table.rows)).not.toContain("80,000");
  });

  it("preserves recorded USD cents while keeping integer COP prices readable", () => {
    const first = row({ currency: "USD", priceMonthly: null, priceNightly: 99.5 });
    const secondUsd = row({
      id: "b", title: "Second", currency: "USD", priceMonthly: null, priceNightly: 99.6,
    });
    const table = surface([first, secondUsd]).component("comparison") as { rows: string[][] };
    expect(table.rows).toContainEqual(["Nightly rent", "USD 99.50", "USD 99.60"]);
    expect(comparablePriceSummary([first, secondUsd])).toContain("USD 99.50");
    expect((surface([row(), second()]).component("comparison") as { rows: string[][] }).rows)
      .toContainEqual(["Monthly rent", "COP 2,400,000", "COP 2,500,000"]);
  });

  it("renders missing facts truthfully, including absent currencies and Wi-Fi", () => {
    const { component } = surface([
      row({ neighborhood: null, bedrooms: null, furnished: null, bathrooms: null, sizeSqm: null, wifiSpeedMbps: null, amenities: [], priceMonthly: null, currency: null }),
      second(),
    ]);
    const table = component("comparison") as { rows: string[][] };
    expect(table.rows).toContainEqual(["Furnished", "Not recorded", "No"]);
    expect(table.rows).toContainEqual(["Wi-Fi speed", "Not recorded", "100 Mbps (listed)"]);
    expect(table.rows).toContainEqual(["Amenities", "Not recorded", "Balcony, Elevator"]);
    expect(table.rows).toContainEqual(["Monthly rent", "Not recorded", "COP 2,500,000"]);
    const unknownCurrency = surface([row({ currency: null }), second()]).component("comparison") as { rows: string[][] };
    expect(unknownCurrency.rows).toContainEqual(["Monthly rent", "2,400,000 (currency not recorded)", "COP 2,500,000"]);
  });

  it("keeps the comparison bounded at five apartments and caps amenity text", () => {
    const many = Array.from({ length: 7 }, (_, i) => row({
      id: String(i), title: `Listing ${i}`, amenities: ["WiFi", "Gym", "Sauna", "Pool", "Balcony"],
    }));
    const { component } = surface(many);
    const table = component("comparison") as { columns: string[]; rows: string[][] };
    expect(table.columns).toHaveLength(6);
    expect(table.rows).toHaveLength(9);
    expect(table.rows.find((r) => r[0] === "Amenities")?.[1]).toBe("WiFi, Gym, Sauna, Pool (+1 more)");
    expect(component("comparison-actions").listingIds).toHaveLength(5);
    expect(component("comparison-title").text).toBe("Compare 5 apartments");
  });

  it("keeps long apartment names and large listed prices intact for horizontal mobile scrolling", () => {
    const longName = "Bright furnished two-bedroom apartment near transit with a balcony and dedicated workspace";
    const { component } = surface([
      row({ title: longName, priceMonthly: 9_876_543_210 }),
      second(),
    ]);
    const table = component("comparison") as { columns: string[]; rows: string[][] };
    expect(table.columns[1]).toBe(longName);
    expect(table.rows).toContainEqual(["Monthly rent", "COP 9,876,543,210", "COP 2,500,000"]);
    expect(component("comparison-note").text).toContain("not confirmed availability");
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
