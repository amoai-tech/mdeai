import { describe, expect, it } from "vitest";
import { shouldForceRenderUi } from "../render-ui-intent";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";

const withHints = {
  get: (key: string) =>
    key === "ag-ui"
      ? { context: [{ description: RENTAL_A2UI_CONTEXT_DESCRIPTION, value: JSON.stringify(["37a05b09-f560-4776-92fd-b8bb2b92e611"]) }] }
      : undefined,
};
const noHints = { get: () => ({ context: [] }) };
const user = (content: string) => [{ role: "user", content }];

describe("shouldForceRenderUi", () => {
  it("pins render_ui when the user asks to see the page results as cards", () => {
    expect(shouldForceRenderUi({
      stepNumber: 0,
      messages: user("Show the first two apartments here as cards"),
      requestContext: withHints,
    })).toBe(true);
  });

  it("does nothing without published page IDs", () => {
    expect(shouldForceRenderUi({
      stepNumber: 0,
      messages: user("show these as cards"),
      requestContext: noHints,
    })).toBe(false);
  });

  it("never overrides an explicit details request", () => {
    expect(shouldForceRenderUi({
      stepNumber: 0,
      messages: user("show details for the first apartment"),
      requestContext: withHints,
    })).toBe(false);
  });

  it("only acts on the first step", () => {
    expect(shouldForceRenderUi({
      stepNumber: 1,
      messages: user("show them as cards"),
      requestContext: withHints,
    })).toBe(false);
  });

  it("ignores an assistant message or a different intent", () => {
    expect(shouldForceRenderUi({
      stepNumber: 0,
      messages: [{ role: "assistant", content: "show these as cards" }],
      requestContext: withHints,
    })).toBe(false);
    expect(shouldForceRenderUi({
      stepNumber: 0,
      messages: user("which apartments are cheapest?"),
      requestContext: withHints,
    })).toBe(false);
  });

  it("reads text from parts-shaped content", () => {
    expect(shouldForceRenderUi({
      stepNumber: 0,
      messages: [{ role: "user", content: { parts: [{ type: "text", text: "display them as cards" }] } }],
      requestContext: withHints,
    })).toBe(true);
  });
});
