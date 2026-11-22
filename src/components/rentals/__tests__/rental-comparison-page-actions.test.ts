import { describe, expect, it } from "vitest";
import { currentComparedRental } from "../rental-comparison-page-actions";
import type { Rental } from "@/mastra/tools/search-rentals";

const visible = [
  { id: "a", title: "Current first" },
  { id: "b", title: "Current second" },
] as Rental[];

describe("official CopilotKit comparison Button IDs", () => {
  it("resolves only the current visible authorized rental rows", () => {
    expect(currentComparedRental(visible, "b")?.title).toBe("Current second");
    expect(currentComparedRental(visible, "B")).toBeNull();
    expect(currentComparedRental(visible, "stale")).toBeNull();
    expect(currentComparedRental([], "a")).toBeNull();
  });
});
