import { describe, expect, it } from "vitest";
import {
  applySetEventBasics,
  applySetPricing,
  applySetEventDraftPreservingManual,
  applySetVenue,
  publishDecisionDraftPatch,
  selectPublishDraft,
} from "@/lib/events/host-event-wizard-tool-handlers";
import { EMPTY_EVENT_DRAFT } from "@/lib/types";

describe("host-event-wizard-tool-handlers", () => {
  it("applySetEventBasics merges title, neighborhood, dateIso", () => {
    const next = applySetEventBasics(EMPTY_EVENT_DRAFT, {
      title: "Startup mixer",
      neighborhood: "Provenza",
      dateIso: "2026-03-15T19:00:00-05:00",
    });
    expect(next.title).toBe("Startup mixer");
    expect(next.neighborhood).toBe("Provenza");
    expect(next.dateIso).toBe("2026-03-15T19:00:00-05:00");
  });

  it("applySetVenue coerces capacity to number", () => {
    const next = applySetVenue(EMPTY_EVENT_DRAFT, {
      venue: "Hotel Intercontinental",
      capacity: "200",
    });
    expect(next.venue).toBe("Hotel Intercontinental");
    expect(next.capacity).toBe(200);
  });

  it("does not let agent patches overwrite a manual form field", () => {
    const manual = { ...EMPTY_EVENT_DRAFT, title: "QA Host AI Salsa Night", capacity: 80 };
    const next = applySetEventDraftPreservingManual(
      manual,
      { title: "Salsa Night in Laureles", capacity: 100, venue: "Poblado" },
      new Set(["title"]),
    );
    expect(next.title).toBe("QA Host AI Salsa Night");
    expect(next.capacity).toBe(100);
    expect(next.venue).toBe("Poblado");
  });

  it("keeps the latest reviewed form over older publish-tool args", () => {
    const latest = {
      ...EMPTY_EVENT_DRAFT,
      title: "QA Host AI Salsa Night",
      neighborhood: "Poblado",
      dateIso: "2026-12-15T20:00:00-05:00",
      venue: "Son Havana",
      capacity: 100,
      priceMinCop: 40000,
      ticketTiers: [{ name: "GA", priceCop: 40000, quantity: 100 }],
    };
    const olderArgs = {
      ...latest,
      title: "Salsa Night",
      capacity: 80,
    };
    expect(selectPublishDraft(olderArgs, latest, true).title).toBe("QA Host AI Salsa Night");
    expect(selectPublishDraft(olderArgs, latest, true).capacity).toBe(100);
  });

  it("applySetPricing keeps existing tiers when omitted", () => {
    const base = applySetPricing(EMPTY_EVENT_DRAFT, {
      priceMinCop: 50000,
      ticketTiers: [{ name: "GA", priceCop: 0, quantity: 100 }],
    });
    const next = applySetPricing(base, { priceMinCop: 75000 });
    expect(next.priceMinCop).toBe(75000);
    expect(next.ticketTiers).toHaveLength(1);
    expect(next.ticketTiers[0]?.name).toBe("GA");
  });

  it("publishDecisionDraftPatch preserves approve race rule", () => {
    expect(publishDecisionDraftPatch("rejected")).toEqual({ status: "rejected" });
    expect(publishDecisionDraftPatch("edit")).toEqual({ status: "draft" });
    expect(publishDecisionDraftPatch("approved")).toBeNull();
  });
});
