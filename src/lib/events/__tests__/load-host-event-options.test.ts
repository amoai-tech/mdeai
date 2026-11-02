import { describe, expect, it } from "vitest";
import { resolveSelectedEvent } from "../load-host-event-options";

const options = [
  { id: "a", name: "Event A", status: "published" },
  { id: "b", name: "Event B", status: "draft" },
];

describe("resolveSelectedEvent", () => {
  it("returns the requested event when the organizer owns it", () => {
    expect(resolveSelectedEvent(options, "b")?.id).toBe("b");
  });

  it("falls back to the first event when the id is foreign or stale", () => {
    expect(resolveSelectedEvent(options, "foreign-id")?.id).toBe("a");
    expect(resolveSelectedEvent(options, null)?.id).toBe("a");
  });

  it("returns null when the organizer has no events", () => {
    expect(resolveSelectedEvent([], "a")).toBeNull();
  });
});
