// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { stashConciergeDraft, takeConciergeDraft } from "@/lib/concierge-draft-store";

/**
 * SAN-1507 — the unsent question a signed-out visitor typed survives the trip to /login in the same
 * tab only: read once, expires, ignores anything that is not what we wrote.
 */
beforeEach(() => window.sessionStorage.clear());

describe("concierge draft store", () => {
  it("returns the stashed question once, then forgets it", () => {
    stashConciergeDraft("What is a good day trip?", 1_000);
    expect(takeConciergeDraft(2_000)).toBe("What is a good day trip?");
    expect(takeConciergeDraft(2_000)).toBeNull();
  });

  it("expires after 30 minutes", () => {
    stashConciergeDraft("old question", 0);
    expect(takeConciergeDraft(31 * 60 * 1000)).toBeNull();
  });

  it("ignores junk and empty text instead of throwing", () => {
    window.sessionStorage.setItem("mde.concierge.draft", "not json");
    expect(takeConciergeDraft()).toBeNull();
    window.sessionStorage.setItem("mde.concierge.draft", JSON.stringify({ text: "   ", at: Date.now() }));
    expect(takeConciergeDraft()).toBeNull();
    window.sessionStorage.setItem("mde.concierge.draft", JSON.stringify({ text: 5, at: "x" }));
    expect(takeConciergeDraft()).toBeNull();
  });

  it("caps very long text", () => {
    stashConciergeDraft("a".repeat(5000), 0);
    expect(takeConciergeDraft(1)?.length).toBe(2000);
  });
});
