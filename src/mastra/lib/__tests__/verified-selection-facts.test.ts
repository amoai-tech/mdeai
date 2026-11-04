import { describe, expect, it } from "vitest";
import { withVerifiedSelectionFacts } from "../discovery-agent-context";

// The adapter hands the processor `{ context: [...] }`, not a bare array.
const agui = (id: string | null, route = "/events") => ({
  context: [{
    description: "Active MDE discovery page, filters, and explicitly selected visible public item.",
    value: JSON.stringify({ route, filters: {}, selectedPublicEntityId: id }),
  }],
});
const userTurn = (text: string) => [{ role: "user", content: text }];
const lookupFound = () => Promise.resolve({
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
    const miss = () => Promise.resolve({ found: false, data: null });
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

  it("does not inject ticket-tier advice for a selected cafe", async () => {
    const original = userTurn("Where is this cafe?");
    expect(await withVerifiedSelectionFacts(original, agui("a1b2c3d4-0001-0001-0001-000000000003", "/cafes"), lookupFound)).toBe(original);
  });

  it("uses verified location and time fields for a meeting-point question", async () => {
    const verified = () => Promise.resolve({
      found: true,
      data: { name: "Feria de las Flores Preview Parade", address: "Listed street address",
        event_start_time: "2027-08-08T15:00:00Z", event_venues: [{ name: "Listed venue" }], event_tickets: [] },
    });
    const out = await withVerifiedSelectionFacts(userTurn("Where is the meeting point and when does it start?"), agui("a1b2c3d4-0001-0001-0001-000000000003"), verified);
    const content = String(out[0].content);
    expect(content).toContain("Listed street address");
    expect(content).toContain("Listed venue");
    expect(content).toContain("2027-08-08T15:00:00Z");
    expect(content).toContain("not confirmed");
  });

  it("accepts the linked event venue as an object, as Supabase returns for a many-to-one relation", async () => {
    const verified = () => Promise.resolve({
      found: true, data: { name: "Feria de las Flores Preview Parade",
        event_venues: { name: "Official event venue", address: "Known venue address", city: "Medellín" } },
    });
    const out = await withVerifiedSelectionFacts(userTurn("Where is the venue?"), agui("a1b2c3d4-0001-0001-0001-000000000003"), verified);
    expect(String(out[0].content)).toContain("Official event venue");
  });

  it("does not claim zero tiers when ticket tiers were not retrieved", async () => {
    const verified = () => Promise.resolve({ found: true, data: { name: "Feria de las Flores Preview Parade" } });
    const out = await withVerifiedSelectionFacts(userTurn("Are tickets available?"), agui("a1b2c3d4-0001-0001-0001-000000000003"), verified);
    expect(String(out[0].content)).not.toContain("no ticket tiers listed");
  });

  it("does not replace an explicit named-event question with the page selection", async () => {
    const original = userTurn("Are tickets available for Reina?");
    expect(await withVerifiedSelectionFacts(original, agui("a1b2c3d4-0001-0001-0001-000000000003"), lookupFound)).toBe(original);
  });

  it("still grounds an explicit question naming the current event", async () => {
    const out = await withVerifiedSelectionFacts(
      userTurn("Are tickets available for Feria de las Flores Preview Parade?"),
      agui("a1b2c3d4-0001-0001-0001-000000000003"), lookupFound,
    );
    expect(String(out[0].content)).toContain("no ticket tiers listed");
  });

  it("includes stored ticket counts without claiming a sale is possible", async () => {
    const lookup = () => Promise.resolve({ found: true, data: {
      name: "Feria de las Flores Preview Parade",
      event_tickets: [{ name: "General", price: 25000, currency: "COP", qty_total: 100, qty_sold: 100 }],
    } });
    const out = await withVerifiedSelectionFacts(
      userTurn("Are tickets sold out?"),
      agui("a1b2c3d4-0001-0001-0001-000000000003"), lookup,
    );
    const content = String(out[0].content);
    expect(content).toContain('"qty_total":100');
    expect(content).toContain('"qty_sold":100');
    expect(content).toContain('"ticket_tier_count":1');
    expect(content).toContain("not proof that checkout is currently available");
  });

  it("preserves rich message parts instead of discarding non-text payloads", async () => {
    const original = [{ role: "user", content: { parts: [
      { type: "text", text: "Are tickets available?" },
      { type: "image", url: "https://example.com/image.png" },
    ] } }];
    const out = await withVerifiedSelectionFacts(original, agui("a1b2c3d4-0001-0001-0001-000000000003"), lookupFound);
    expect(out[0].content.parts[0].text).toContain("SERVER-VERIFIED ITEM ON SCREEN");
    expect(out[0].content.parts[1]).toEqual(original[0].content.parts[1]);
  });

});
