import { describe, expect, it } from "vitest";
import { selectPublishDraft } from "@/lib/events/host-event-wizard-tool-handlers";
import { EMPTY_EVENT_DRAFT, EventDraftStateSchema, isDraftReadyForPublish } from "@/lib/types";

const complete = EventDraftStateSchema.parse({
  title: "[QA] Salsa Night",
  neighborhood: "Laureles",
  dateIso: "2026-12-15T20:00:00-05:00",
  venue: "Son Havana",
  capacity: 60,
  priceMinCop: 40000,
});

describe("selectPublishDraft", () => {
  it("uses the complete wizard draft when the model sends no draft", () => {
    expect(selectPublishDraft(undefined, complete)).toEqual(complete);
  });

  it("fills a partial model draft from the reviewed wizard state", () => {
    expect(selectPublishDraft({ title: "AI title" }, complete)).toMatchObject({
      title: "AI title",
      dateIso: complete.dateIso,
      venue: complete.venue,
      capacity: complete.capacity,
    });
  });

  it("uses the reviewed date when AI sends a malformed ISO datetime", () => {
    expect(selectPublishDraft({ dateIso: "not-a-date" }, complete)).toEqual(complete);
    expect(selectPublishDraft({ dateIso: "2026-99-99T20:00:00-05:00" }, complete)).toEqual(complete);
  });

  it("accepts local wizard dates without discarding a valid AI description", () => {
    const localWizard = { ...complete, dateIso: "2026-12-15T20:00" };
    expect(isDraftReadyForPublish(localWizard)).toBe(true);
    expect(selectPublishDraft({ description: "Updated AI description" }, localWizard))
      .toMatchObject({
        dateIso: "2026-12-15T20:00-05:00",
        description: "Updated AI description",
        priceMinCop: 40000,
      });
  });

  it("normalizes a local wizard date even with empty tool arguments", () => {
    const localWizard = { ...complete, dateIso: "2026-12-15T20:00" };
    const result = selectPublishDraft({}, localWizard);
    expect(result.dateIso).toBe("2026-12-15T20:00-05:00");
    expect(new Date(result.dateIso!).toISOString()).toBe("2026-12-16T01:00:00.000Z");
    expect(selectPublishDraft(undefined, localWizard).dateIso).toBe(result.dateIso);
  });

  it("preserves an explicit agent timezone offset instead of replacing it", () => {
    expect(selectPublishDraft({ dateIso: "2026-12-15T20:00:00+02:00" }, complete).dateIso)
      .toBe("2026-12-15T20:00:00+02:00");
  });

  it("retains valid AI edits when only its proposed datetime is malformed", () => {
    expect(selectPublishDraft({
      dateIso: "not-a-date",
      description: "New description",
      priceMinCop: 50000,
    }, complete)).toMatchObject({
      dateIso: complete.dateIso,
      description: "New description",
      priceMinCop: 50000,
    });
  });

  it("handles wrong types without crashing the HITL renderer", () => {
    expect(selectPublishDraft(null, complete)).toEqual(complete);
    expect(selectPublishDraft("not an object", complete)).toEqual(complete);
    expect(selectPublishDraft({ capacity: "invalid" }, complete)).toEqual(complete);
    expect(selectPublishDraft({ ticketTiers: [{ priceCop: -1 }] }, complete)).toEqual(complete);
  });

  it("does not let AI args forge a published status or receipt identity", () => {
    expect(selectPublishDraft({
      status: "published",
      publishedEventId: "fake",
      publishedSlug: "fake",
      approvalRequestId: "fake",
    }, complete)).toEqual(complete);
  });

  it("does not invent a publishable draft when both sources are incomplete", () => {
    const result = selectPublishDraft({ title: "Only a title" }, EMPTY_EVENT_DRAFT);
    expect(isDraftReadyForPublish(result)).toBe(false);
  });
});
