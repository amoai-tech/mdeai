import { describe, it, expect } from "vitest";
import {
  applyChipToggle,
  CHAT_FILTER_CHIPS,
  EVENT_SUB_CHIPS,
  isChipActive,
} from "@/platform/copilot/chat-filter-chips";
import { buildRentalSearchParams } from "@/lib/rental-query-parser";
import { rentalMonthlyBudgetPredicate, budgetNoteFor } from "@/mastra/tools/search-rentals";

describe("chat-filter-chips", () => {
  const laureles = CHAT_FILTER_CHIPS.find((c) => c.id === "laureles")!;

  it("activates Laureles neighborhood in working memory", () => {
    const next = applyChipToggle(undefined, laureles, true);
    expect(next.lastRentalQuery?.neighborhood).toBe("Laureles");
    expect(next.lastIntent).toBe("rental_search");
    expect(isChipActive(next, laureles)).toBe(true);
  });

  it("deactivates neighborhood when toggled off", () => {
    const active = applyChipToggle(undefined, laureles, true);
    const off = applyChipToggle(active, laureles, false);
    expect(off.lastRentalQuery?.neighborhood).toBeUndefined();
    expect(isChipActive(off, laureles)).toBe(false);
  });

  it("events chip sets lastIntent", () => {
    const events = CHAT_FILTER_CHIPS.find((c) => c.id === "events")!;
    const next = applyChipToggle(undefined, events, true);
    expect(next.lastIntent).toBe("event_discovery");
    expect(isChipActive(next, events)).toBe(true);
  });

  it("event sub-chip sets category and clears genericAskPending", () => {
    const nightlife = EVENT_SUB_CHIPS.find((c) => c.id === "ev-nightlife")!;
    const next = applyChipToggle(
      { lastEventQuery: { genericAskPending: true } },
      nightlife,
      true,
    );
    expect(next.lastEventQuery?.category).toBe("nightlife");
    expect(next.lastEventQuery?.genericAskPending).toBe(false);
    expect(isChipActive(next, nightlife)).toBe(true);
  });

  it("show-all sub-chip sets broad dateWindow", () => {
    const showAll = EVENT_SUB_CHIPS.find((c) => c.id === "ev-all")!;
    const next = applyChipToggle(undefined, showAll, true);
    expect(next.lastEventQuery?.dateWindow).toBe("any");
    expect(isChipActive(next, showAll)).toBe(true);
  });
  it("sets an exact COP monthly budget and clears an obsolete nightly cap", () => {
    const price = CHAT_FILTER_CHIPS.find((c) => c.id === "under-4m")!;
    expect(price.label).toBe("Under COP 4M/month");
    const previous = {
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPricePerNight: 80,
        budgetType: "nightly" as const,
      },
    };
    const active = applyChipToggle(previous, price, true);
    expect(active.lastRentalQuery).toMatchObject({
      neighborhood: "Laureles",
      minBedrooms: 2,
      maxPriceMonthly: 4_000_000,
      budgetCurrency: "COP",
      budgetType: "monthly",
    });
    expect(active.lastRentalQuery?.maxPricePerNight).toBeUndefined();
    expect(isChipActive(active, price)).toBe(true);
  });

  it("removes only the COP budget when toggled off, retaining neighborhood and bedrooms", () => {
    const price = CHAT_FILTER_CHIPS.find((c) => c.id === "under-4m")!;
    const active = applyChipToggle({
      lastRentalQuery: { neighborhood: "Laureles", minBedrooms: 2 },
    }, price, true);
    const off = applyChipToggle(active, price, false);
    expect(off.lastRentalQuery?.neighborhood).toBe("Laureles");
    expect(off.lastRentalQuery?.minBedrooms).toBe(2);
    expect(off.lastRentalQuery?.maxPriceMonthly).toBeUndefined();
    expect(off.lastRentalQuery?.budgetCurrency).toBeUndefined();
    expect(off.lastRentalQuery?.budgetType).toBeUndefined();
    expect(isChipActive(off, price)).toBe(false);
    expect(isChipActive({
      lastRentalQuery: { maxPricePerNight: 80, budgetType: "nightly" },
    }, price)).toBe(false);
  });

  it("routes the chip sentence through the real rental parser without a nightly conversion", () => {
    const price = CHAT_FILTER_CHIPS.find((c) => c.id === "under-4m")!;
    const memory = applyChipToggle({
      lastRentalQuery: { neighborhood: "Laureles", minBedrooms: 2 },
    }, price, true);
    const params = buildRentalSearchParams(
      "Find rental apartments under COP 4,000,000/month",
      memory,
    );
    expect(params).toMatchObject({
      neighborhood: "Laureles",
      minBedrooms: 2,
      maxPriceMonthly: 4_000_000,
      budgetCurrency: "COP",
      stayType: "monthly",
    });
    expect(params?.maxPricePerNight).toBeUndefined();
    // Existing Mastra/Supabase tool compares only stored same-currency monthly values.
    const predicate = rentalMonthlyBudgetPredicate(4_000_000, "COP");
    expect(predicate).toContain("currency.eq.COP,price_monthly.not.is.null,price_monthly.lte.4000000");
    expect(predicate).toContain("currency.neq.COP");
    expect(predicate).not.toContain("price_daily.lte");
    expect(budgetNoteFor({ ...params })).toMatch(/other currencies/i);
  });

});
