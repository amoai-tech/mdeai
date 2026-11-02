import { describe, it, expect } from "vitest";
import { EVENT_CLARIFY_MESSAGE } from "@/lib/event-clarify-copy";
import { shouldInstantEventClarify } from "@/lib/event-search-fast-path";

describe("event clarify local UI", () => {
  it("canned clarify copy matches EVP-006", () => {
    expect(EVENT_CLARIFY_MESSAGE).toContain("What kind of events are you looking for?");
    expect(EVENT_CLARIFY_MESSAGE).toContain("Music");
  });

  it("citywide query searches immediately; only a bare event prompt clarifies", () => {
    expect(shouldInstantEventClarify("list events in medellin", {})).toBe(false);
    expect(shouldInstantEventClarify("events?", {})).toBe(true);
  });
});
