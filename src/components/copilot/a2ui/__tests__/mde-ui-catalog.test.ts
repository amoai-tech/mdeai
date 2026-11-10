import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { standardUI } from "@copilotkit/react-core/v2/generative-ui";
import {
  MDE_OMITTED_STANDARD_COMPONENTS,
  collectEventResults,
  collectRentalResults,
  eventDetailHref,
  findEventRow,
  findRentalRow,
  mdeUI,
  mergeEventResults,
  mergeRentalResults,
  rentalDetailHref,
  selectRentalMessages,
} from "../mde-ui-catalog";
import {
  RENTAL_RECOMMENDATIONS_COMPONENTS,
  RENTAL_RECOMMENDATIONS_SURFACE_ID,
} from "../rental-recommendations-surface";

const laureles = {
  results: [
    { id: "real-1", title: "Bright 2BR", neighborhood: "Laureles", price_monthly: 3_800_000, currency: "COP" },
  ],
};
const poblado = {
  results: [
    { id: "real-2", title: "Poblado Studio", neighborhood: "El Poblado", price_monthly: 4_500_000, currency: "COP" },
  ],
};

describe("MDE A2UI catalog", () => {
  it("keeps a small, versioned grounded core with RentalCard and EventCard", () => {
    expect(mdeUI.id).toBe("mde/discovery@1");
    expect(mdeUI.components.has("RentalCard")).toBe(true);
    expect(mdeUI.components.has("EventCard")).toBe(true);
  });

  it("exposes exactly the documented vocabulary", () => {
    // The server guide documents these props by name; anything else in the
    // catalog would be a component the model has to guess at. Update both
    // together, never one alone.
    expect([...mdeUI.components.keys()].sort()).toEqual([
      "Badge", "Box", "Caption", "Card", "Column", "Divider", "EventCard",
      "FollowUp", "Grid", "GridItem", "Label", "RentalCard", "Row", "Spacer",
      "Text", "Title",
    ]);
  });

  it("omits every control until a catalog function is registered", () => {
    // A rendered Button or input with no bound action is a dead control next to
    // real listings. SAN-1655/SAN-1658 add these back with their functions.
    for (const name of [
      "Button", "Pressable", "Form", "TextField", "TextArea", "Select",
      "CheckBox", "Radio", "RadioGroup", "Slider", "DateTimeInput",
      "SegmentedControl", "ChoicePicker", "Tabs",
    ]) {
      expect(mdeUI.components.has(name), `${name} must stay omitted`).toBe(false);
    }
  });

  it("omits data structures and remote-content components the guide does not teach", () => {
    for (const name of [
      "Table", "TableSection", "TableRow", "TableCell", "List", "ListItem",
      "Chart", "Map", "Icon", "Image", "ImageGrid", "Link", "LinkCard",
      "Citation", "HtmlView", "Svg",
    ]) {
      expect(mdeUI.components.has(name), `${name} must stay omitted`).toBe(false);
    }
  });

  it("cannot drift from the installed Standard Catalog", () => {
    // Every omitted name must still exist upstream (a typo or a removed name
    // would make omit() throw or silently hide nothing)...
    for (const name of MDE_OMITTED_STANDARD_COMPONENTS) {
      expect(standardUI.components.has(name), `${name} is not a standardUI component`).toBe(true);
    }
    // ...and every installed standard component is either exposed or explicitly
    // omitted. A new upstream component fails here instead of appearing in the
    // prompt undocumented.
    const exposedStandard = [...mdeUI.components.keys()].filter((name) =>
      standardUI.components.has(name),
    );
    const accounted = new Set([...exposedStandard, ...MDE_OMITTED_STANDARD_COMPONENTS]);
    expect([...standardUI.components.keys()].filter((name) => !accounted.has(name))).toEqual([]);
    expect(exposedStandard.length + MDE_OMITTED_STANDARD_COMPONENTS.length).toBe(
      standardUI.components.size,
    );
    // No duplicates: a name in both lists would make the accounting above lie.
    expect(MDE_OMITTED_STANDARD_COMPONENTS.filter((name) => exposedStandard.includes(name))).toEqual([]);
  });

  it("lets only the Rentals panel's allowlist onto that Surface", () => {
    // The panel is a place for real apartments, not a second free-form canvas
    // and not a place for dead controls.
    expect([...RENTAL_RECOMMENDATIONS_COMPONENTS]).toEqual([
      "RentalCard", "Column", "Row", "Divider", "Title",
    ]);
    for (const name of RENTAL_RECOMMENDATIONS_COMPONENTS) {
      expect(mdeUI.components.has(name), `${name} is allowed on the panel but missing from mdeUI`).toBe(true);
    }
  });

  it("uses a page target that is not the chat target", () => {
    expect(RENTAL_RECOMMENDATIONS_SURFACE_ID).toBe("rental-recommendations");
    expect(RENTAL_RECOMMENDATIONS_SURFACE_ID).not.toBe("chat");
  });

  it("keeps an older card usable after a newer search", () => {
    // Newest result first, exactly as collectRentalResults returns them.
    const results = [poblado, laureles];
    expect(findRentalRow(results, "real-1")).toMatchObject({
      title: "Bright 2BR",
      neighborhood: "Laureles",
    });
    expect(findRentalRow([poblado], "real-1")).toBeNull();
    expect(findRentalRow(results, "forged-id")).toBeNull();
    expect(findRentalRow(results, "0")).toBeNull();
    expect(findRentalRow([], "real-1")).toBeNull();
  });

  it("merges fast-path and agent results without duplicates", () => {
    const fast = { results: [{ id: "fast-1" }] };
    const agent = { results: [{ id: "agent-1" }] };
    expect(mergeRentalResults([fast], [agent, fast])).toEqual([fast, agent]);
  });

  it("revalidates an ID against the merged authorized history and rejects forged IDs", () => {
    const older = { results: [{ id: "laureles-1", title: "Laureles", neighborhood: "Laureles" }] };
    const current = { results: [{ id: "poblado-1", title: "Poblado", neighborhood: "El Poblado" }] };
    const merged = mergeRentalResults([current], [older]);
    // An existing card stays usable from authorized history...
    expect(findRentalRow(merged, "laureles-1")).toMatchObject({ id: "laureles-1" });
    // ...but a new/forged ID cannot be invented into the card.
    expect(findRentalRow(merged, "forged-1")).toBeNull();
    expect(findRentalRow([current], "laureles-1")).toBeNull();
  });

  it("collects every finished rental result on the thread, newest first", () => {
    const messages = [
      { role: "user", content: "Laureles" },
      { role: "assistant", toolCalls: [{ id: "a", function: { name: "searchRentalsTool" } }] },
      { role: "tool", toolCallId: "a", content: JSON.stringify(laureles) },
      { role: "user", content: "El Poblado" },
      { role: "assistant", toolCalls: [{ id: "b", function: { name: "search-rentals" } }] },
      { role: "tool", toolCallId: "b", content: JSON.stringify(poblado) },
    ];
    const results = collectRentalResults(messages);
    expect(results).toHaveLength(2);
    expect(findRentalRow(results, "real-1")).toMatchObject({ title: "Bright 2BR" });
    expect(findRentalRow(results, "real-2")).toMatchObject({ title: "Poblado Studio" });
  });

  it("falls back to the active agent when broker chat has no concierge coagent", () => {
    const direct = [{ role: "tool", toolCallId: "a", content: JSON.stringify(laureles) }];
    expect(selectRentalMessages(undefined, direct)).toEqual(direct);
    expect(selectRentalMessages([], direct)).toEqual(direct);
    expect(selectRentalMessages(direct, undefined)).toEqual(direct);
  });

  it("routes broker details to the canonical rental page", () => {
    expect(rentalDetailHref("37a05b09-f560-4776-92fd-b8bb2b92e611")).toBe(
      "/rentals/37a05b09-f560-4776-92fd-b8bb2b92e611",
    );
    expect(rentalDetailHref("a/b")).toBe("/rentals/a%2Fb");
  });


  it("resolves an event card only from authorized event history", () => {
    const first = "b5f1f4b2-9d63-4d2c-8a2a-4e5f0d6c1a11";
    const second = "c6a2e5c3-0e74-4e3d-9b3b-5f6a1e7d2b22";
    const older = { results: [{ id: first, title: "Concert", venue: "Venue", startsAt: "2026-11-07T23:00:00.000Z", pricePerTicket: 40_000, currency: "COP" }] };
    const newer = { results: [{ id: second, title: "Festival", venue: "Park", startsAt: "2026-11-08T23:00:00.000Z", pricePerTicket: 60_000, currency: "COP" }] };
    expect(findEventRow(mergeEventResults([newer], [older]), first)).toMatchObject({ title: "Concert", venue: "Venue" });
    expect(findEventRow([newer], first)).toBeNull();
    expect(findEventRow([older], "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(findEventRow([older], "not-a-uuid")).toBeNull();
  });

  it("collects finished event tool results newest first", () => {
    const first = "b5f1f4b2-9d63-4d2c-8a2a-4e5f0d6c1a11";
    const second = "c6a2e5c3-0e74-4e3d-9b3b-5f6a1e7d2b22";
    const messages = [
      { role: "assistant", toolCalls: [{ id: "a", function: { name: "searchEventsTool" } }] },
      { role: "tool", toolCallId: "a", content: JSON.stringify({ results: [{ id: first, title: "Concert" }] }) },
      { role: "assistant", toolCalls: [{ id: "b", function: { name: "search-events" } }] },
      { role: "tool", toolCallId: "b", content: JSON.stringify({ results: [{ id: second, title: "Festival" }] }) },
    ];
    const results = collectEventResults(messages);
    expect(results).toHaveLength(2);
    expect(findEventRow(results, first)).toMatchObject({ title: "Concert" });
    expect(findEventRow(results, second)).toMatchObject({ title: "Festival" });
  });

  it("routes broker event details to the canonical event page", () => {
    expect(eventDetailHref("b5f1f4b2-9d63-4d2c-8a2a-4e5f0d6c1a11")).toBe(
      "/events/b5f1f4b2-9d63-4d2c-8a2a-4e5f0d6c1a11",
    );
    expect(eventDetailHref("a/b")).toBe("/events/a%2Fb");
  });

  it("accepts only a real UUID eventId", () => {
    const props = mdeUI.components.get("EventCard")?.props as z.ZodTypeAny | undefined;
    expect(props).toBeDefined();
    expect(props?.safeParse({ eventId: "b5f1f4b2-9d63-4d2c-8a2a-4e5f0d6c1a11" }).success).toBe(true);
    expect(props?.safeParse({ eventId: "event-1" }).success).toBe(false);
    expect(props?.safeParse({ eventId: "" }).success).toBe(false);
    expect(props?.safeParse({ pricePerTicket: 1 }).success).toBe(false);
  });

  it("accepts only a non-empty opaque listingId", () => {
    const props = mdeUI.components.get("RentalCard")?.props as z.ZodTypeAny | undefined;
    expect(props).toBeDefined();
    expect(props?.safeParse({ listingId: "external-listing-42" }).success).toBe(true);
    expect(props?.safeParse({ listingId: "" }).success).toBe(false);
    expect(props?.safeParse({ listingId: 42 }).success).toBe(false);
    expect(props?.safeParse({ price: 2_400_000 }).success).toBe(false);
  });
});
