import { describe, expect, it } from "vitest";
import {
  eventUpdateInputSchema,
  formatBogotaInput,
  parseBogotaLocal,
  toEventUpdatePatch,
} from "../update-event-core";

const base = {
  eventId: "0d162c54-21aa-4580-8d56-ad79b855fccf",
  expectedUpdatedAt: "2026-10-26T02:44:09.093421+00:00",
  name: "Salsa Night at Teatro Lido",
  description: "Live band, doors 7pm.",
  eventStartTime: "2026-11-14T19:00",
  eventEndTime: "2026-11-14T23:30",
  address: "Calle 47 #52-30",
  city: "Medellín",
};

describe("eventUpdateInputSchema", () => {
  it("accepts a complete edit", () => {
    const parsed = eventUpdateInputSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("rejects a name shorter than three characters", () => {
    const parsed = eventUpdateInputSchema.safeParse({ ...base, name: "ab" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === "name")).toBe(true);
    }
  });

  it("rejects an end time before the start time", () => {
    const parsed = eventUpdateInputSchema.safeParse({
      ...base,
      eventStartTime: "2026-11-14T22:00",
      eventEndTime: "2026-11-14T20:00",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === "eventEndTime")).toBe(true);
    }
  });

  it("rejects unparseable dates", () => {
    const parsed = eventUpdateInputSchema.safeParse({
      ...base,
      eventStartTime: "not-a-date",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a revision so a stale tab cannot overwrite newer changes", () => {
    const parsed = eventUpdateInputSchema.safeParse({ ...base, expectedUpdatedAt: "" });
    expect(parsed.success).toBe(false);
  });
});

describe("Bogotá time handling", () => {
  it("parses a datetime-local value as Medellín wall-clock time (UTC-5)", () => {
    expect(new Date(parseBogotaLocal("2026-11-14T19:00")).toISOString()).toBe(
      "2026-11-15T00:00:00.000Z",
    );
  });

  it("round-trips a stored timestamp into a datetime-local value", () => {
    expect(formatBogotaInput("2026-11-15T00:00:00.000Z")).toBe("2026-11-14T19:00");
  });

  it("returns an empty string for missing or invalid timestamps", () => {
    expect(formatBogotaInput(null)).toBe("");
    expect(formatBogotaInput("nope")).toBe("");
  });
});

describe("toEventUpdatePatch", () => {
  it("maps only editable columns and stamps the new revision", () => {
    const input = eventUpdateInputSchema.parse(base);
    const patch = toEventUpdatePatch(input, "2026-10-26T03:00:00.000Z");

    expect(patch).toMatchObject({
      name: "Salsa Night at Teatro Lido",
      description: "Live band, doors 7pm.",
      address: "Calle 47 #52-30",
      city: "Medellín",
      updated_at: "2026-10-26T03:00:00.000Z",
    });
    expect(patch.event_start_time).toBe("2026-11-15T00:00:00.000Z");
    expect(patch.event_end_time).toBe("2026-11-15T04:30:00.000Z");
    // Never allow an edit to retarget the row or its owner.
    expect(Object.keys(patch)).not.toContain("id");
    expect(Object.keys(patch)).not.toContain("organizer_id");
    expect(Object.keys(patch)).not.toContain("status");
  });

  it("clears optional values instead of writing empty strings", () => {
    const input = eventUpdateInputSchema.parse({
      ...base,
      description: "   ",
      eventEndTime: "",
      address: "",
    });
    const patch = toEventUpdatePatch(input, "2026-10-26T03:00:00.000Z");
    expect(patch.description).toBeNull();
    expect(patch.event_end_time).toBeNull();
    expect(patch.address).toBeNull();
  });
});
