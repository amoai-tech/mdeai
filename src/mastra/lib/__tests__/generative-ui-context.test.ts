import { describe, expect, it } from "vitest";
import { readGenerativeUIGuide, withMdeA2UIContract } from "../generative-ui-context";

describe("readGenerativeUIGuide", () => {
  it("returns the runtime's A2UI guide from the AG-UI context", () => {
    const guide = readGenerativeUIGuide({
      context: [
        { description: "App context", value: "{\"page\":\"rentals\"}" },
        {
          description: "Generative UI guide: available components, functions, targets, and how to call render_ui.",
          value: "Use RentalCard with a listingId from the current results.",
        },
      ],
    });
    expect(guide).toBe("Use RentalCard with a listingId from the current results.");
  });

  it("returns null when the run has no A2UI guide", () => {
    expect(readGenerativeUIGuide({ context: [{ description: "App context", value: "x" }] })).toBeNull();
    expect(readGenerativeUIGuide(null)).toBeNull();
    expect(readGenerativeUIGuide({})).toBeNull();
  });

  it("adds the MDE operation contract only when the runtime guide exists", () => {
    expect(withMdeA2UIContract(null)).toBeNull();
    const guide = withMdeA2UIContract("runtime guide");
    expect(guide).toContain("runtime guide");
    expect(guide).toContain('id: "root", component: "RentalCard"');
    expect(guide).toContain("Never use an array index");
  });

  it("ignores malformed entries instead of leaking raw objects into the prompt", () => {
    expect(readGenerativeUIGuide({
      context: [
        { description: "Generative UI guide:", value: { not: "a string" } },
        { description: "Generative UI guide:", value: "  " },
      ],
    })).toBeNull();
  });
});
