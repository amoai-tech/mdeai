import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
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
  it("exports a small, versioned catalog with RentalCard and EventCard", () => {
    expect(mdeUI.id).toBe("mde/discovery@1");
    expect([...mdeUI.components.keys()]).toEqual(["RentalCard", "EventCard"]);
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

  it("does not hydrate near-miss rental IDs or change meaningful leading zeros", () => {
    // Rental IDs are opaque; a leading zero or a separator can be part of a real source ID.
    const results = [{ results: [
      { id: "00123", title: "Leading-zero rental" },
      { id: "external:00123", title: "Composite source rental" },
    ] }];
    expect(findRentalRow(results, "00123")).toMatchObject({ title: "Leading-zero rental" });
    expect(findRentalRow(results, "external:00123")).toMatchObject({ title: "Composite source rental" });

    // Invalid or lookalike IDs must not pick a different authorized result.
    for (const nearMiss of [
      "", " ", "\t", "123", "00123 ", " 00123", "00123/", "00123:",
      "00123,", "00123;external:00123", "external:00123:", "external:00123 ",
    ]) {
      expect(findRentalRow(results, nearMiss), `near miss: ${JSON.stringify(nearMiss)}`).toBeNull();
    }
    const props = mdeUI.components.get("RentalCard")?.props as z.ZodTypeAny;
    expect(props.safeParse({ listingId: "" }).success).toBe(false);
    expect(props.safeParse({ listingId: 123 }).success).toBe(false);
    expect(props.safeParse({ listingId: "00123" }).success).toBe(true);
    expect(props.safeParse({ listingId: "external:00123" }).success).toBe(true);
  });

  it("rejects malformed event UUID near misses before looking up current results", () => {
    const id = "b5f1f4b2-9d63-4d2c-8a2a-4e5f0d6c1a11";
    const results = [{ results: [{ id, title: "Authorized concert" }] }];
    const props = mdeUI.components.get("EventCard")?.props as z.ZodTypeAny;
    expect(props.safeParse({ eventId: id }).success).toBe(true);
    expect(findEventRow(results, id)).toMatchObject({ title: "Authorized concert" });
    for (const nearMiss of [
      "", " ", "\t", ` ${id}`, `${id} `, `${id}/`, `${id}:`,
      `${id},`, `${id};other`, id.slice(1), "00000000-0000-0000-0000-000000000001",
    ]) {
      expect(findEventRow(results, nearMiss), `near miss: ${JSON.stringify(nearMiss)}`).toBeNull();
      // A syntactically valid UUID that is absent from this thread must still not hydrate.
      if (nearMiss !== "00000000-0000-0000-0000-000000000001") {
        expect(props.safeParse({ eventId: nearMiss }).success).toBe(false);
      }
    }
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
