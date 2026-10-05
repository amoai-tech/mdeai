import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "@mastra/schema-compat/zod-to-json";
import { createThreadMemory } from "../../lib/agent-memory";
import {
  conciergeAgent,
  conciergeMemoryInput,
  conciergeWorkingMemorySchema,
  omitPaddedMemoryFields,
} from "../concierge";

describe("conciergeAgent", () => {
  it('has id "concierge-agent"', () => {
    expect(conciergeAgent.id).toBe("concierge-agent");
  });

  it("registers all search tools including grounding and web events", async () => {
    const tools = await conciergeAgent.listTools();
    const toolIds = Object.values(tools).map((tool) => tool.id);
    expect(toolIds).toEqual(
      expect.arrayContaining([
        "search-rentals",
        "search-events",
        "search-restaurants",
        "search-attractions",
        "search-grounded-places",
        "search-web-grounded-events",
      ]),
    );
    expect(toolIds.filter((id) => id.startsWith("search-"))).toHaveLength(6);
  });

  it("working memory schema accepts concierge state shape", () => {
    const parsed = conciergeWorkingMemorySchema.parse({
      lastIntent: "rental_search",
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 1,
        maxPricePerNight: 80,
        budgetType: "nightly",
      },
      lastRentalResults: [
        {
          id: "r1",
          title: "1BR Laureles",
          neighborhood: "Laureles",
          nightly_price: 75,
        },
      ],
    });
    expect(parsed.lastIntent).toBe("rental_search");
    expect(parsed.lastRentalQuery?.neighborhood).toBe("Laureles");
  });

  it("working memory supports follow-up refinement fields", () => {
    const parsed = conciergeWorkingMemorySchema.parse({
      lastIntent: "rental_search",
      lastRentalQuery: { maxPricePerNight: 56 },
      selectedListingId: "r1",
    });
    expect(parsed.selectedListingId).toBe("r1");
    expect(parsed.lastRentalQuery?.maxPricePerNight).toBe(56);
  });

  it("working memory preserves rental query genericAskPending", () => {
    const parsed = conciergeWorkingMemorySchema.parse({
      lastIntent: "rental_search",
      lastRentalQuery: {
        neighborhood: "Laureles",
        genericAskPending: true,
      },
    });
    expect(parsed.lastRentalQuery?.genericAskPending).toBe(true);
  });

  it("instructions require refining rentals on show cheaper", async () => {
    const instructions = await conciergeAgent.getInstructions();
    expect(instructions).toContain("show cheaper options");
    expect(instructions).toContain("lastRentalQuery");
    expect(instructions).toContain("do NOT repeat card fields");
    expect(instructions).toContain("event clarification gate");
    expect(instructions).toContain("genericAskPending");
  });

  it("instructions require web grounding after fresh event queries", async () => {
    const instructions = await conciergeAgent.getInstructions();
    expect(instructions).toContain("search-web-grounded-events");
    expect(instructions).toContain("From the web");
    expect(instructions).toContain("fewer than 3 rows");
  });

  it("instructions forbid repeating grounded place names in prose", async () => {
    const instructions = await conciergeAgent.getInstructions();
    expect(instructions).toContain("NEVER list cafés or venues by name");
    expect(instructions).toContain("View on Google Maps");
  });

  it("instructions tell agent to pass search-grounded-places intent for nightlife and cafés", async () => {
    const instructions = await conciergeAgent.getInstructions();
    expect(instructions).toContain('intent: "nightlife"');
    expect(instructions).toContain('intent: "cafe"');
    expect(instructions).toContain('intent "nightlife"');
    expect(instructions).toContain("popular venues in Provenza tonight");
    expect(instructions).toContain("search-events");
  });

  it("working memory accepts event query with genericAskPending", () => {
    const parsed = conciergeWorkingMemorySchema.parse({
      lastIntent: "event_discovery",
      lastEventQuery: {
        category: "nightlife",
        dateWindow: "this_weekend",
        genericAskPending: false,
      },
    });
    expect(parsed.lastEventQuery?.category).toBe("nightlife");
  });

  // PERF-002: extract-intent-slots was a no-op echo tool the agent was told to
  // call first, adding a Gemini step every agent turn. Routing now relies on the
  // client-side classifier + the per-search clarification gates, so the tool is
  // unwired. Guard against it being re-added to the concierge tool set.
  it("does not register the no-op extract-intent-slots tool", async () => {
    const tools = await conciergeAgent.listTools();
    const toolIds = Object.values(tools).map((tool) => tool.id);
    expect(toolIds).not.toContain("extract-intent-slots");
  });

  it("working memory accepts router intents including restaurant_discovery", () => {
    const restaurant = conciergeWorkingMemorySchema.parse({
      lastIntent: "restaurant_discovery",
    });
    expect(restaurant.lastIntent).toBe("restaurant_discovery");

    const venue = conciergeWorkingMemorySchema.parse({ lastIntent: "venue_booking" });
    expect(venue.lastIntent).toBe("venue_booking");
  });

  it("working memory rental genericAskPending defaults to undefined when omitted", () => {
    const parsed = conciergeWorkingMemorySchema.parse({
      lastRentalQuery: { neighborhood: "Poblado" },
    });
    expect(parsed.lastRentalQuery?.genericAskPending).toBeUndefined();
  });

  it("working memory preserves rental query genericAskPending false", () => {
    const parsed = conciergeWorkingMemorySchema.parse({
      lastRentalQuery: { genericAskPending: false },
    });
    expect(parsed.lastRentalQuery?.genericAskPending).toBe(false);
  });
});

/**
 * SAN-1387 — Gemini pads optional fields with "" / null. The pinned
 * @mastra/memory tool validates the model's args against the concierge schema,
 * so a blank enum rejected the WHOLE update and Sofia's preferences were lost.
 * These run the real `updateWorkingMemory` tool (via Memory.listTools) against
 * production-shaped payloads, with no real user text.
 */
describe("concierge updateWorkingMemory tolerates provider padding", () => {
  const existing = {
    lastIntent: "rental_search",
    lastRentalQuery: { neighborhood: "Laureles", minBedrooms: 1, maxPricePerNight: 1000, budgetType: "monthly" },
    selectedListingId: "listing-1",
    lastEventQuery: { category: "music", dateWindow: "this_weekend", neighborhood: "Poblado" },
    selectedEventId: "event-1",
    lastRestaurantQuery: { cuisine: "paisa", priceTier: "$$" },
    mapUi: { selectedPinId: "rental-123", activeCategories: ["rental"], pinCountByCategory: { rental: 4 } },
  };

  type UpdateTool = {
    inputSchema: Parameters<typeof zodToJsonSchema>[0];
    execute: (input: unknown, ctx: unknown) => Promise<{ error?: boolean }>;
  };
  const updateTool = () =>
    (createThreadMemory(conciergeWorkingMemorySchema, { memoryInput: conciergeMemoryInput }).listTools() as unknown as {
      updateWorkingMemory: UpdateTool;
    }).updateWorkingMemory;

  async function update(memory: unknown, stored: Record<string, unknown> = existing) {
    const tool = updateTool();
    let saved: Record<string, unknown> | undefined;
    const out = await tool.execute(
      { memory },
      {
        agent: { threadId: "t", resourceId: "r" },
        memory: {
          getThreadById: async () => ({ id: "t", resourceId: "r" }),
          getWorkingMemory: async () => JSON.stringify(stored),
          updateWorkingMemory: async (a: { workingMemory: string }) => {
            saved = JSON.parse(a.workingMemory);
          },
        },
      },
    );
    return { out, saved };
  }

  it("blank rental budgetType is dropped and the saved rental query survives", async () => {
    const { out, saved } = await update({ lastRentalQuery: { budgetType: "", neighborhood: "Poblado" } });
    expect(out.error).toBeUndefined();
    expect(saved?.lastRentalQuery).toEqual({ neighborhood: "Poblado", minBedrooms: 1, maxPricePerNight: 1000, budgetType: "monthly" });
  });

  it("blank event category and dateWindow do not erase saved event filters", async () => {
    const { out, saved } = await update({ lastEventQuery: { category: "", dateWindow: "", neighborhood: "Laureles" } });
    expect(out.error).toBeUndefined();
    expect(saved?.lastEventQuery).toEqual({ category: "music", dateWindow: "this_weekend", neighborhood: "Laureles" });
  });

  it("blank restaurant priceTier does not erase the saved tier", async () => {
    const { out, saved } = await update({ lastRestaurantQuery: { priceTier: "", cuisine: "sushi" } });
    expect(out.error).toBeUndefined();
    expect(saved?.lastRestaurantQuery).toEqual({ cuisine: "sushi", priceTier: "$$" });
  });

  it("null optional rental strings are dropped, not treated as 'delete'", async () => {
    const { out, saved } = await update({ lastRentalQuery: { neighborhood: null, checkIn: null, checkOut: null, budgetType: null } });
    expect(out.error).toBeUndefined();
    expect(saved?.lastRentalQuery).toEqual(existing.lastRentalQuery);
  });

  it("null / blank selectedListingId and selectedEventId do not clear the selection", async () => {
    const { out, saved } = await update({ selectedListingId: null, selectedEventId: "" });
    expect(out.error).toBeUndefined();
    expect(saved?.selectedListingId).toBe("listing-1");
    expect(saved?.selectedEventId).toBe("event-1");
  });

  it("a partial mapUi patch (viewport only) keeps the pin and categories", async () => {
    const { out, saved } = await update({ mapUi: { viewport: { lat: 6.2, lng: -75.5, zoom: 13 } } });
    expect(out.error).toBeUndefined();
    expect(saved?.mapUi).toEqual({ ...existing.mapUi, viewport: { lat: 6.2, lng: -75.5, zoom: 13 } });
  });

  it("a partial mapUi patch (counts/categories only) keeps the selected pin", async () => {
    const { out, saved } = await update({ mapUi: { activeCategories: ["event"], pinCountByCategory: { event: 2 } } });
    expect(out.error).toBeUndefined();
    expect((saved?.mapUi as Record<string, unknown>).selectedPinId).toBe("rental-123");
    expect((saved?.mapUi as Record<string, unknown>).activeCategories).toEqual(["event"]);
  });

  it("a blank mapUi.selectedPinId does not clear the saved pin, but null still means no selection", async () => {
    const blank = await update({ mapUi: { selectedPinId: "", viewport: { lat: 6.2, lng: -75.5, zoom: 13 } } });
    expect(blank.out.error).toBeUndefined();
    expect((blank.saved?.mapUi as Record<string, unknown>).selectedPinId).toBe("rental-123");

    const cleared = await update({ mapUi: { selectedPinId: null } });
    expect(cleared.out.error).toBeUndefined();
    expect(cleared.saved?.mapUi).not.toHaveProperty("selectedPinId");
  });

  it("survives a thread-lookup failure and clears the pin without throwing", async () => {
    const tool = updateTool();
    let saved: Record<string, unknown> | undefined;
    const out = await tool.execute(
      { memory: { mapUi: { selectedPinId: null } } },
      {
        agent: { threadId: "t", resourceId: "r" },
        memory: {
          getThreadById: async () => {
            throw new Error("storage unavailable");
          },
          getWorkingMemory: async () => JSON.stringify(existing),
          updateWorkingMemory: async (a: { workingMemory: string }) => {
            saved = JSON.parse(a.workingMemory);
          },
        },
      },
    );
    expect(out).toMatchObject({ success: true });
    expect(saved?.mapUi).not.toHaveProperty("selectedPinId");
  });

  it("soft-fails when reading working memory throws", async () => {
    const tool = updateTool();
    const out = await tool.execute(
      { memory: { mapUi: { selectedPinId: null } } },
      {
        agent: { threadId: "t", resourceId: "r" },
        memory: {
          getThreadById: async () => ({ id: "t", resourceId: "r" }),
          getWorkingMemory: async () => {
            throw new Error("storage unavailable");
          },
          updateWorkingMemory: async () => {},
        },
      },
    );
    expect(out).toMatchObject({ success: false });
  });

  it("leaves a non-object stored document untouched and reports it instead of throwing", async () => {
    const { out, saved } = await update(
      { mapUi: { selectedPinId: null } },
      null as never,
    );
    expect(out).toMatchObject({ success: false });
    expect(saved).toBeUndefined();
  });

  it("real values survive: minBedrooms 0 (studio), false booleans, valid enums", async () => {
    const { out, saved } = await update({
      lastRentalQuery: { minBedrooms: 0, genericAskPending: false, budgetType: "nightly" },
      lastEventQuery: { dateWindow: "this_weekend", genericAskPending: false },
      lastRestaurantQuery: { priceTier: "$$$" },
    });
    expect(out.error).toBeUndefined();
    expect(saved?.lastRentalQuery).toMatchObject({ minBedrooms: 0, genericAskPending: false, budgetType: "nightly" });
    expect(saved?.lastEventQuery).toMatchObject({ dateWindow: "this_weekend", genericAskPending: false });
    expect(saved?.lastRestaurantQuery).toMatchObject({ priceTier: "$$$" });
  });

  it("empty arrays keep Mastra's replace semantics", async () => {
    const { out, saved } = await update({ lastRentalResults: [], lastEventResults: [] }, { ...existing, lastRentalResults: [{ id: "r", title: "t", neighborhood: "n", nightly_price: 1 }] });
    expect(out.error).toBeUndefined();
    expect(saved?.lastRentalResults).toEqual([]);
    expect(saved?.lastEventResults).toEqual([]);
  });

  it("a genuinely invalid enum value is still rejected", async () => {
    const { out } = await update({ lastRentalQuery: { budgetType: "hourly" } });
    expect(out.error).toBe(true);
  });

  it("the model-facing schema is unchanged: real enums only, no blank accepted", () => {
    const json = JSON.stringify(zodToJsonSchema(updateTool().inputSchema));
    expect(json).toContain('"nightly","monthly","total_trip"');
    expect(json).not.toContain('""');
  });

  it("padded fields are removed (key absent), never set to undefined, which the merge would copy over saved data", () => {
    const out = omitPaddedMemoryFields({
      selectedListingId: "",
      lastRentalQuery: { budgetType: " ", minBedrooms: 0, neighborhood: null },
    }) as { lastRentalQuery: Record<string, unknown> };
    expect(out).not.toHaveProperty("selectedListingId");
    expect(out.lastRentalQuery).toEqual({ minBedrooms: 0 });
    expect("budgetType" in out.lastRentalQuery).toBe(false);
  });

  it("the strict canonical schema still rejects blanks (tolerance is at the tool boundary only)", () => {
    expect(conciergeWorkingMemorySchema.safeParse({ lastRentalQuery: { budgetType: "" } }).success).toBe(false);
  });
});
