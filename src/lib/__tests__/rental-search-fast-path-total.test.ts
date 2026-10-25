import { describe, expect, it } from "vitest";
import type { Rental } from "@/mastra/tools/search-rentals";
import { rentalsToToolEnvelope } from "@/lib/rental-search-fast-path";
import { normalizeToolEnvelope } from "@/lib/normalize-tool-envelope";

const rentals = [
  { id: "1", title: "One", neighborhood: "Laureles" },
  { id: "2", title: "Two", neighborhood: "El Poblado" },
  { id: "3", title: "Three", neighborhood: "Envigado" },
] as Rental[];

describe("SAN-1503 · short chat results versus the full catalog", () => {
  it("preserves the backend total even when the search shows only 3 cards", () => {
    const envelope = rentalsToToolEnvelope(rentals, { total: 42 });
    expect(normalizeToolEnvelope(envelope).total).toBe(42);
    expect(envelope.results).toHaveLength(3);
  });
  it("does not invent a total when the server did not provide one", () => {
    expect(rentalsToToolEnvelope(rentals).total).toBe(3);
    expect(rentalsToToolEnvelope(rentals, { total: 2 }).total).toBe(3);
    expect(rentalsToToolEnvelope(rentals, { total: -1 }).total).toBe(3);
  });
  it("preserves all 15 imported listings when returned by the search", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ ...rentals[0], id: String(i) }));
    expect(rentalsToToolEnvelope(rows, { total: 15 }).results).toHaveLength(15);
    expect(rentalsToToolEnvelope(rows, { total: 15 }).total).toBe(15);
  });
});
