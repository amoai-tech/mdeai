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

  it("does not invent a publishable draft when both sources are incomplete", () => {
    const result = selectPublishDraft({ title: "Only a title" }, EMPTY_EVENT_DRAFT);
    expect(isDraftReadyForPublish(result)).toBe(false);
  });
});
