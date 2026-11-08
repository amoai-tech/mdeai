import { describe, expect, it } from "vitest";
import { isRouteQuestion, routeEndpoints, shouldForceRouteTool } from "../route-tool-choice";

const user = (text: string) => ({ role: "user", content: text });

describe("route intent", () => {
  it.each([
    "How long is the walk from Parque Lleras to Provenza?",
    "Distance between Laureles and Provenza",
    "¿Cuánto se tarda de Laureles a Provenza?",
    "¿Cómo llegar desde Envigado hasta El Poblado?",
    "How far is it from Parque Lleras to the airport by car?",
  ])("recognizes route with both endpoints: %s", (text) => {
    expect(isRouteQuestion(text)).toBe(true);
  });

  it.each([
    "Find cafés within walking distance to the Metro",
    "apartamento de 2 habitaciones a pie del metro",
    "desde 2 millones hasta 3 millones",
    "book a table from 7 to 9",
    "How far is the airport?",
    "How long is the walk from the apartment to the airport?",
    "How long is the walk?",
    "Which café has Wi-Fi?",
    "Find quiet cafés in Laureles",
    "Show me the walk to Provenza",
    "Busco apartamento cerca de Laureles a pie",
    "Find a cafe I can walk to from Laureles to meet friends",
    "from my hotel to Provenza",
    "from my apartment to the airport",
  ])("does not force without two place endpoints: %s", (text) => {
    expect(isRouteQuestion(text)).toBe(false);
  });

  it("parses endpoints for the tool payload", () => {
    expect(routeEndpoints("from Parque Lleras to Provenza")).toEqual({
      origin: "Parque Lleras",
      destination: "Provenza",
    });
  });
});

describe("route tool choice", () => {
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
