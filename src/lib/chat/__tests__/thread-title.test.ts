import { describe, expect, it } from "vitest";
import {
  deriveThreadTitle,
  deriveTitleFromStoredMessages,
  isMeaningfulThreadTitle,
} from "../thread-title";

describe("isMeaningfulThreadTitle (SAN-1412)", () => {
  it("is false for a missing, blank or placeholder title", () => {
    for (const raw of [null, undefined, "", "   ", "\n\t", "Untitled Thread", "  Untitled Thread  ", 42, {}]) {
      expect(isMeaningfulThreadTitle(raw)).toBe(false);
    }
  });

  it("is true for a real title", () => {
    expect(isMeaningfulThreadTitle("Apartment search in Laureles")).toBe(true);
    // Only the exact placeholder is refused, not a title that merely contains the words.
    expect(isMeaningfulThreadTitle("Untitled Thread ideas for a salsa night")).toBe(true);
  });
});

describe("deriveThreadTitle (SAN-1412)", () => {
  it("keeps a short useful message unchanged", () => {
    expect(deriveThreadTitle("Find me a quiet 2-bedroom in Laureles under COP 4M.")).toBe(
      "Find me a quiet 2-bedroom in Laureles under COP 4M.",
    );
  });

  it("trims and collapses spaces and newlines", () => {
    expect(deriveThreadTitle("  salsa   events\n\nthis   weekend \t")).toBe("salsa events this weekend");
  });

  it("returns null when nothing useful remains", () => {
    for (const raw of ["", "   ", "\n\t "]) expect(deriveThreadTitle(raw)).toBeNull();
  });

  it("limits a long message to 60 characters with exactly one ellipsis, cutting at a word", () => {
    const long =
      "Find me a quiet furnished two bedroom apartment in Laureles near the metro with a desk and fast wifi for a month";
    const title = deriveThreadTitle(long)!;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("…")).toBe(true);
    expect(title.match(/…/g)).toHaveLength(1);
    // The text before the ellipsis is whole words of the original, not a cut-off word.
    const stem = title.slice(0, -1);
    expect(long.startsWith(stem)).toBe(true);
    expect(long.slice(stem.length, stem.length + 1)).toBe(" ");
  });

  it("hard-cuts a single very long word instead of returning nothing", () => {
    const title = deriveThreadTitle("a".repeat(200))!;
    expect(title).toHaveLength(60);
    expect(title.endsWith("…")).toBe(true);
  });

  it("is deterministic", () => {
    const text = "x ".repeat(100);
    expect(deriveThreadTitle(text)).toBe(deriveThreadTitle(text));
  });

  it("does not add an ellipsis to a message of exactly 60 characters", () => {
    const sixty = "a".repeat(30) + " " + "b".repeat(29);
    expect(sixty).toHaveLength(60);
    expect(deriveThreadTitle(sixty)).toBe(sixty);
  });
});

const row = (id: string, role: string, text: string) => ({
  id,
  role,
  content: JSON.stringify({ format: 2, parts: [{ type: "text", text }] }),
});

describe("deriveTitleFromStoredMessages (SAN-1412)", () => {
  it("uses the earliest useful USER message, never assistant text", () => {
    const rows = [
      row("m1", "assistant", "Hello! How can I help?"),
      row("m2", "user", "   "),
      row("m3", "user", "2BR in Laureles under COP 4M"),
      row("m4", "user", "and Poblado?"),
    ];
    expect(deriveTitleFromStoredMessages(rows)).toBe("2BR in Laureles under COP 4M");
  });

  it("returns null when there is no useful user message", () => {
    expect(deriveTitleFromStoredMessages([])).toBeNull();
    expect(deriveTitleFromStoredMessages([row("m1", "assistant", "Hi")])).toBeNull();
    expect(deriveTitleFromStoredMessages([{ id: "m1", role: "user", content: "not json" }])).toBeNull();
  });
});
