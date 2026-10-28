import { describe, expect, it } from "vitest";
import { nextPinSelection } from "@/platform/maps/pin-selection";

describe("nextPinSelection", () => {
  it("selects a pin when nothing is selected", () => {
    expect(nextPinSelection(null, "venue-a")).toBe("venue-a");
  });

  it("clears the selection when the selected pin is clicked again", () => {
    expect(nextPinSelection("venue-a", "venue-a")).toBeNull();
  });

  it("replaces the selection when another pin is clicked", () => {
    expect(nextPinSelection("venue-a", "venue-b")).toBe("venue-b");
  });
});
