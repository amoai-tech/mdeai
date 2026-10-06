import { describe, expect, it } from "vitest";
import { normalizeThreadTitle, threadLabel } from "../thread-label";

describe("normalizeThreadTitle", () => {
  it("keeps a real title exactly as stored", () => {
    expect(normalizeThreadTitle("Apartment search in Laureles")).toBe("Apartment search in Laureles");
    expect(normalizeThreadTitle("Untitled Thread")).toBe("Untitled Thread");
  });

  it("returns null for a missing or blank title, never the text 'null'", () => {
    for (const raw of [null, undefined, "", "   ", "\n\t", 42, {}]) {
      expect(normalizeThreadTitle(raw)).toBeNull();
    }
  });
});

describe("threadLabel", () => {
  it("shows the stored title when there is one", () => {
    expect(threadLabel("Weekend events", "2026-10-02T21:32:00Z", "en-US")).toBe("Weekend events");
  });

  it("builds a dated fallback from the last-activity time in the viewer's own time zone", () => {
    // The label follows the machine's time zone on purpose, so the expected text is computed the same
    // way instead of pinning a calendar day (21:32 UTC is already Oct 3 in Moscow and Auckland).
    const iso = "2026-10-02T21:32:00Z";
    const expectedWhen = new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const label = threadLabel(null, iso, "en-US");
    expect(label).toBe(`Chat · ${expectedWhen}`);
    expect(label).toMatch(/^Chat · [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}\s?(AM|PM)$/);
  });

  it("falls back to a plain 'Chat' when the date cannot be read", () => {
    expect(threadLabel(null, "not a date", "en-US")).toBe("Chat");
    expect(threadLabel(null, "", "en-US")).toBe("Chat");
  });
});
