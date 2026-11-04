import { describe, expect, it } from "vitest";
import { withVerifiedSelectionFacts } from "../discovery-agent-context";

// The adapter hands the processor `{ context: [...] }`, not a bare array.
const agui = (id: string | null) => ({
  context: [{
    description: "Active MDE discovery page, filters, and explicitly selected visible public item.",
    value: JSON.stringify({ route: "/events", filters: {}, selectedPublicEntityId: id }),
  }],
});
const userTurn = (text: string) => [{ role: "user", content: text }];
const lookupFound = async () => ({
  found: true,
  data: { id: "a1b2c3d4-0001-0001-0001-000000000003", name: "Feria de las Flores Preview Parade", event_tickets: [] },
});

describe("SAN-1600 — a simple question about the item on screen carries its verified facts", () => {
  it("puts the verified record in the user turn so the model need not ask which event", async () => {
    const out = await withVerifiedSelectionFacts(userTurn("Are tickets available?"), agui("a1b2c3d4-0001-0001-0001-000000000003"), lookupFound);
    const content = String(out[0].content);
    expect(content).toContain("SERVER-VERIFIED ITEM ON SCREEN");
    expect(content).toContain("Feria de las Flores Preview Parade");
    expect(content).toContain("no ticket tiers listed");
  });

  it("leaves the turn untouched when nothing is selected", async () => {
    const original = userTurn("Are tickets available?");
    expect(await withVerifiedSelectionFacts(original, agui(null), lookupFound)).toBe(original);
  });

  it("leaves the turn untouched when the lookup cannot verify the item", async () => {
    const original = userTurn("Are tickets available?");
    const miss = async () => ({ found: false, data: null });
    expect(await withVerifiedSelectionFacts(original, agui("a1b2c3d4-0001-0001-0001-000000000003"), miss)).toBe(original);
  });

  it("does not hijack an unrelated discovery request", async () => {
    const original = userTurn("Find salsa events in El Poblado this Friday");
    expect(await withVerifiedSelectionFacts(original, agui("a1b2c3d4-0001-0001-0001-000000000003"), lookupFound)).toBe(original);
  });

  it("leaves an explicit two-item comparison to the comparison processor", async () => {
    const original = userTurn("Compare these two events");
    expect(await withVerifiedSelectionFacts(original, agui("a1b2c3d4-0001-0001-0001-000000000003"), lookupFound)).toBe(original);
  });
});
