import { describe, expect, it } from "vitest";
import { forceEventCardRender } from "../event-card-render-processor";

const EVENT_ID = "a1b2c3d4-0001-0001-0001-000000000003";
const hints = [{
  role: "system",
  content: `Active event result ID hints, in display order:\n- ${EVENT_ID}`,
}];

describe("forceEventCardRender", () => {
  it("forces the existing render_ui tool on the first step for a card request", () => {
    expect(forceEventCardRender({
      stepNumber: 0,
      messages: [{ role: "user", content: "Show the first event as a card." }],
      systemMessages: hints,
    })).toEqual({ toolChoice: { type: "tool", toolName: "render_ui" } });
  });

  it("does not force a second step or a non-card message", () => {
    expect(forceEventCardRender({
      stepNumber: 1,
      messages: [{ role: "user", content: "Show the first event as a card." }],
      systemMessages: hints,
    })).toBeNull();
    expect(forceEventCardRender({
      stepNumber: 0,
      messages: [{ role: "user", content: "Show me cultural events in Medellín." }],
      systemMessages: hints,
    })).toBeNull();
  });

  it("requires an authorized event hint", () => {
    expect(forceEventCardRender({
      stepNumber: 0,
      messages: [{ role: "user", content: "Show the first event as a card." }],
      systemMessages: [{ role: "system", content: "No event results are active." }],
    })).toBeNull();
  });
});
