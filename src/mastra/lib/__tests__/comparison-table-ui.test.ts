import { describe, expect, it } from "vitest";
import { buildComparisonTableOps, type ComparisonRow } from "../comparison-table-ui";

type Create = { createSurface: { components: Array<Record<string, unknown>> } };
function createOf(built: ReturnType<typeof buildComparisonTableOps>): Create {
  return built!.operations.find((op) => "createSurface" in op) as unknown as Create;
}

const row = (overrides: Partial<ComparisonRow> = {}): ComparisonRow => ({
  id: "37a05b09-f560-4776-92fd-b8bb2b92e601",
  title: "Calle 10 #42-15",
  bedrooms: 2,
  price: 2_400_000,
  currency: "COP",
  period: "month",
  ...overrides,
});

function table(rows: ComparisonRow[], replace = false) {
  return buildComparisonTableOps(rows, undefined, { replace })!;
}

describe("buildComparisonTableOps", () => {
  it("puts the official Table inside a plain Column, never a Card", () => {
    const built = table([row(), row({ id: "37a05b09-f560-4776-92fd-b8bb2b92e602", title: "Zitios", price: 2_500_000 })]);
    const op = built.operations[0] as { version: string; createSurface: { components: Array<Record<string, unknown>> } };
    expect(built.target).toBe("chat");
    expect(op.version).toBe("1.0");
    expect(op.createSurface.components[0]).toMatchObject({ id: "root", component: "Column", children: ["comparison"] });
    expect(op.createSurface.components[1]).toMatchObject({
      id: "comparison",
      component: "Table",
      columns: ["Apartment", "Bedrooms", "Monthly Price", "Currency"],
    });
    expect(JSON.stringify(built)).not.toContain('"Card"');
  });

  it("uses monthly values and never invents a nightly rate", () => {
    const built = table([row(), row({ id: "b", title: "Second", price: 2_500_000 })]);
    const cells = createOf(built).createSurface.components[1] as { columns: string[]; rows: unknown[][] };
    expect(cells.rows).toEqual([
      ["Calle 10 #42-15", 2, "COP 2,400,000", "COP"],
      ["Second", 2, "COP 2,500,000", "COP"],
    ]);
    expect(JSON.stringify(cells)).not.toContain("Nightly");
    expect(JSON.stringify(cells)).not.toContain("80000");
  });

  it("labels mixed periods and keeps missing facts unknown", () => {
    const built = table([
      row(),
      row({ id: "b", title: "Nightly stay", price: 80, currency: "USD", period: "night", bedrooms: null }),
    ]);
    const cells = createOf(built).createSurface.components[1] as { columns: string[]; rows: unknown[][] };
    expect(cells.columns).toEqual(["Apartment", "Bedrooms", "Price", "Currency / Period"]);
    expect(cells.rows[1]).toEqual(["Nightly stay", "Not recorded", "USD 80", "USD / night"]);
  });

  it("caps at five rows and four columns", () => {
    const built = table(Array.from({ length: 7 }, (_, index) => row({ id: `id-${index}`, title: `A${index}` })));
    const cells = createOf(built).createSurface.components[1] as { columns: string[]; rows: unknown[][] };
    expect(cells.rows).toHaveLength(5);
    expect(cells.columns).toHaveLength(4);
  });

  it("replaces a previous surface instead of stacking", () => {
    const built = table([row(), row({ id: "b" })], true);
    expect(built.operations[0]).toMatchObject({ version: "1.0", deleteSurface: { surfaceId: "comparison-table" } });
    expect(built.operations[1]).toMatchObject({ version: "1.0", createSurface: {} });
  });

  it("returns null with fewer than two rows", () => {
    expect(buildComparisonTableOps([row()])).toBeNull();
  });
});
