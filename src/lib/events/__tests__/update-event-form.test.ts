import { describe, expect, it } from "vitest";
import { eventUpdateInputFromFormData } from "../update-event-form";

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const valid = {
  eventId: "0d162c54-21aa-4580-8d56-ad79b855fccf",
  expectedUpdatedAt: "2026-10-26T02:44:09.093421+00:00",
  name: "Salsa Night at Teatro Lido",
  description: "Live band",
  eventStartTime: "2026-11-14T19:00",
  eventEndTime: "2026-11-14T23:30",
  address: "Calle 47 #52-30",
  city: "Medellín",
};

describe("eventUpdateInputFromFormData", () => {
  it("parses the browser form into the validated contract", () => {
    const parsed = eventUpdateInputFromFormData(formData(valid));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.eventId).toBe(valid.eventId);
      expect(parsed.data.expectedUpdatedAt).toBe(valid.expectedUpdatedAt);
      expect(parsed.data.name).toBe(valid.name);
    }
  });

  it("treats a missing field as empty rather than throwing", () => {
    const rest: Record<string, string> = { ...valid };
    delete rest.name;
    const parsed = eventUpdateInputFromFormData(formData(rest));
    expect(parsed.success).toBe(false);
  });

  it("rejects a form that omits the revision (stale-write guard)", () => {
    const rest: Record<string, string> = { ...valid };
    delete rest.expectedUpdatedAt;
    const parsed = eventUpdateInputFromFormData(formData(rest));
    expect(parsed.success).toBe(false);
  });

  it("rejects end before start", () => {
    const parsed = eventUpdateInputFromFormData(
      formData({ ...valid, eventStartTime: "2026-11-14T22:00", eventEndTime: "2026-11-14T20:00" }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === "eventEndTime")).toBe(true);
    }
  });
});
