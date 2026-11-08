import { describe, expect, it } from "vitest";
import { isRouteQuestion, shouldForceRouteTool } from "../route-tool-choice";

const user = (text: string) => ({ role: "user", content: text });

describe("route tool choice", () => {
  it("recognizes English and Spanish route questions", () => {
    expect(isRouteQuestion("How long is the walk from Parque Lleras to Provenza?")).toBe(true);
    expect(isRouteQuestion("¿Cuánto se tarda de Laureles a Provenza?")).toBe(true);
  });

  it("does not treat café discovery as a route request", () => {
    expect(isRouteQuestion("Find quiet cafés in Laureles")).toBe(false);
    expect(isRouteQuestion("Which café has Wi-Fi?")).toBe(false);
    expect(isRouteQuestion("Find cafés within walking distance")).toBe(false);
  });

  it("forces computeRouteTool on the first model step", () => {
    expect(shouldForceRouteTool({
      stepNumber: 0,
      messages: [user("How long is the walk from Parque Lleras to Provenza?")],
      steps: [],
    })).toBe(true);
  });

  it("does not force after the route tool already ran", () => {
    expect(shouldForceRouteTool({
      stepNumber: 1,
      messages: [user("How long is the walk from Parque Lleras to Provenza?")],
      steps: [{ toolCalls: [{ toolName: "computeRouteTool" }] }],
    })).toBe(false);
  });
});
