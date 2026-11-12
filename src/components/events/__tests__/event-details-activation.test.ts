// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { activateEventDetails } from "../event-details-activation";

// skipcq: JS-0067 - module-local test helper; not browser global scope
function harness(visibleIds: string[]) {
  return {
    visibleIds,
    select: vi.fn(),
    open: vi.fn(),
    rememberTrigger: vi.fn(),
  };
}

describe("activateEventDetails", () => {
  it("uses the native card's own trigger and opens that event", () => {
    const h = harness(["evt-1"]);
    const trigger = document.createElement("button");
    expect(
      activateEventDetails({ id: "evt-1", trigger, activeElement: null, ...h }),
    ).toBe(true);
    expect(h.select).toHaveBeenCalledWith("evt-1");
    expect(h.open).toHaveBeenCalledWith("evt-1");
    expect(h.rememberTrigger).toHaveBeenCalledWith(trigger);
  });

  it("falls back to the active element for a generated card, so focus returns there", () => {
    const h = harness(["evt-1"]);
    const activeElement = document.createElement("button");
    expect(
      activateEventDetails({ id: "evt-1", trigger: null, activeElement, ...h }),
    ).toBe(true);
    expect(h.rememberTrigger).toHaveBeenCalledWith(activeElement);
  });

  it("does nothing for an event that is not in the visible results", () => {
    const h = harness(["evt-1"]);
    expect(
      activateEventDetails({ id: "stale", trigger: null, activeElement: null, ...h }),
    ).toBe(false);
    expect(h.select).not.toHaveBeenCalled();
    expect(h.open).not.toHaveBeenCalled();
    expect(h.rememberTrigger).not.toHaveBeenCalled();
  });
});
