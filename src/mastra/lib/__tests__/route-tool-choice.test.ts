import { describe, expect, it } from "vitest";
import {
  getRoutePlan,
  isRouteQuestion,
  MDEAI_ROUTE_PLAN_KEY,
  routeEndpoints,
  routePlanForTurn,
  routeTravelMode,
  shouldForceRouteTool,
} from "../route-tool-choice";

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

  it("forces a mode follow-up after an earlier route question", () => {
    expect(shouldForceRouteTool({
      stepNumber: 0,
      messages: [
        user("How long is the walk from Parque Lleras to Provenza?"),
        { role: "assistant", content: "It is 2.3 km." },
        user("And by car?"),
      ],
      steps: [],
    })).toBe(true);
  });

  it("does not force unrelated later messages in a route thread", () => {
    const base = [
      user("How long is the walk from Parque Lleras to Provenza?"),
      { role: "assistant", content: "It is 2.3 km." },
    ];
    expect(shouldForceRouteTool({ stepNumber: 0, messages: [...base, user("What about cafés in Laureles?")], steps: [] })).toBe(false);
    expect(shouldForceRouteTool({ stepNumber: 0, messages: [...base, user("Find apartments within walking distance of the metro")], steps: [] })).toBe(false);
  });

  it("forces a short Spanish mode follow-up", () => {
    expect(shouldForceRouteTool({
      stepNumber: 0,
      messages: [
        user("¿Cuánto se tarda de Laureles a Provenza?"),
        { role: "assistant", content: "45 minutos." },
        user("¿Y en bici?"),
      ],
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

describe("deterministic route plan", () => {
  it("hands the user's own endpoints and walking mode to the tool", () => {
    expect(routePlanForTurn([user("Walk from Parque Lleras to Provenza")])).toEqual({
      origin: "Parque Lleras",
      destination: "Provenza",
      travelMode: "WALK",
    });
  });

  it("derives driving and bicycling from the user's wording", () => {
    expect(routePlanForTurn([user("Drive from Parque Lleras to Provenza")])?.travelMode).toBe("DRIVE");
    expect(routePlanForTurn([user("¿Cuánto se tarda en bici de Laureles a Provenza?")])?.travelMode).toBe("BICYCLE");
  });

  it("reuses the previous endpoints for a mode-only follow-up", () => {
    expect(routePlanForTurn([
      user("How long is the walk from Parque Lleras to Provenza?"),
      { role: "assistant", content: "It is 2.3 km." },
      user("And by car?"),
    ])).toEqual({ origin: "Parque Lleras", destination: "Provenza", travelMode: "DRIVE" });
  });

  it.each([
    ["How far is the airport?", null],
    ["Show me the walk to Provenza", null],
    ["from here to Provenza", null],
    ["from my hotel to the airport", null],
    ["Find cafés within walking distance to the Metro", null],
    ["book a table from 7 to 9", null],
  ])("does not invent a plan for %s", (text, expected) => {
    expect(routePlanForTurn([user(text)])).toEqual(expected);
  });

  it("reads a valid plan back from RequestContext and rejects junk", () => {
    const store = new Map<string, unknown>();
    const context = {
      requestContext: {
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => store.set(key, value),
      },
    };
    store.set(MDEAI_ROUTE_PLAN_KEY, {
      origin: "Parque Lleras",
      destination: "Provenza",
      travelMode: "DRIVE",
    });
    expect(getRoutePlan(context)).toEqual({
      origin: "Parque Lleras",
      destination: "Provenza",
      travelMode: "DRIVE",
    });
    store.set(MDEAI_ROUTE_PLAN_KEY, { origin: "", destination: "Provenza", travelMode: "WALK" });
    expect(getRoutePlan(context)).toBeNull();
    store.set(MDEAI_ROUTE_PLAN_KEY, { origin: "A", destination: "B", travelMode: "TELEPORT" });
    expect(getRoutePlan(context)).toBeNull();
  });

  it("defaults to walking and honors explicit transit", () => {
    expect(routeTravelMode("How far is it?")).toBe("WALK");
    expect(routeTravelMode("How long by public transport?")).toBe("TRANSIT");
    expect(routeTravelMode("¿Cuánto se tarda en auto?")).toBe("DRIVE");
  });

  it("does not let an endpoint name choose the mode, and explicit walk wins", () => {
    expect(routeTravelMode(
      "Walk from Parque Lleras to the Poblado metro station",
      { origin: "Parque Lleras", destination: "the Poblado metro station" },
    )).toBe("WALK");
    expect(routeTravelMode(
      "How far is it from Laureles to Bike House by car?",
      { origin: "Laureles", destination: "Bike House" },
    )).toBe("DRIVE");
    expect(routeTravelMode(
      "Distance between Laureles and Provenza by bus",
      { origin: "Laureles", destination: "Provenza" },
    )).toBe("TRANSIT");
  });

  it("accepts the mode phrases the follow-up recognizer also honors", () => {
    for (const followUp of ["And by taxi?", "¿Y en bus?", "And on foot?", "¿Y en carro?"]) {
      expect(routePlanForTurn([
        user("How long is the walk from Parque Lleras to Provenza?"),
        { role: "assistant", content: "It is 2.3 km." },
        user(followUp),
      ])).not.toBeNull();
    }
  });

  it("strips a trailing travel-mode clause from the destination", () => {
    expect(routePlanForTurn([
      user("How far is it from Parque Lleras to the airport by car?"),
    ])).toEqual({
      origin: "Parque Lleras",
      destination: "the airport",
      travelMode: "DRIVE",
    });
    expect(routeEndpoints("Distance between Laureles and Provenza by bike")).toEqual({
      origin: "Laureles",
      destination: "Provenza",
    });
    expect(routePlanForTurn([
      user("¿Cuánto se tarda de Laureles a Provenza en bici?"),
    ])).toEqual({
      origin: "Laureles",
      destination: "Provenza",
      travelMode: "BICYCLE",
    });
    expect(routeEndpoints("How far from Laureles to Provenza a pie")).toEqual({
      origin: "Laureles",
      destination: "Provenza",
    });
    expect(routeEndpoints("¿Cuánto se tarda de Laureles a Provenza caminando?")).toEqual({
      origin: "Laureles",
      destination: "Provenza",
    });
    expect(routeEndpoints("Distance from Laureles to Provenza andando")).toEqual({
      origin: "Laureles",
      destination: "Provenza",
    });
  });
});
