// @vitest-environment jsdom
/**
 * SAN-1422 · Make map results truthful and clear stale pins when results have no coordinates.
 * `ToolPinsSync` is how agent tool results reach the map. A finished result must always replace its
 * category's pins (even with none), a changed coordinate is a real update, and an unfinished result
 * must not touch the map.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const merge = vi.hoisted(() => vi.fn());
vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ mergePinsByCategory: merge }),
}));

import { ToolPinsSync } from "@/components/copilot/tool-pins-sync";

type Category = "rental" | "event" | "restaurant" | "grounded";

let root: Root;
let container: HTMLElement;

function show(category: Category, result: unknown) {
  act(() => root.render(<ToolPinsSync category={category} result={result} />));
}

const mapped = (id: string, latitude: number, longitude: number) => ({
  id,
  title: `Place ${id}`,
  neighborhood: "Poblado",
  latitude,
  longitude,
});

const groundedRow = (id: string, latitude?: number, longitude?: number) => ({
  id,
  title: `Cafe ${id}`,
  mapsUrl: "https://maps.google.com/?cid=1",
  placeId: id,
  ...(latitude === undefined ? {} : { latitude, longitude }),
});

beforeEach(() => {
  merge.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ToolPinsSync replaces a category with each finished result", () => {
  it("clears the old pins when the next result has no coordinates", () => {
    show("event", { results: [mapped("e1", 6.2, -75.5)] });
    expect(merge).toHaveBeenLastCalledWith("event", [expect.objectContaining({ id: "event-e1" })]);

    show("event", { results: [{ id: "e2", title: "No location yet", neighborhood: "Centro" }] });
    expect(merge).toHaveBeenLastCalledWith("event", []);
  });

  it("clears the old pins when the next result has zero rows", () => {
    show("rental", { results: [mapped("r1", 6.25, -75.59)] });
    show("rental", { results: [] });
    expect(merge).toHaveBeenLastCalledWith("rental", []);
  });

  it("applies a corrected coordinate for the same pin id", () => {
    show("restaurant", { results: [mapped("s1", 6.2, -75.5)] });
    show("restaurant", { results: [mapped("s1", 6.3, -75.6)] });
    expect(merge).toHaveBeenCalledTimes(2);
    expect(merge).toHaveBeenLastCalledWith("restaurant", [
      expect.objectContaining({ id: "restaurant-s1", lat: 6.3, lng: -75.6 }),
    ]);
  });

  it("does not re-merge the same finished result", () => {
    const result = { results: [mapped("e1", 6.2, -75.5)] };
    show("event", result);
    show("event", { results: [mapped("e1", 6.2, -75.5)] });
    expect(merge).toHaveBeenCalledTimes(1);
  });
});

describe("ToolPinsSync leaves the map alone for unfinished input", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a half-streamed JSON string", '{"results": [{"id": "e1", "lat'],
    ["a wrapper whose inner result is null", { result: null }],
    ["an AG-UI tool-result whose inner result is half-streamed", [{ type: "tool-result", result: '{"results": [{"id": "e1", "lat' }]],
    ["an AG-UI tool-result whose inner result is null", [{ type: "tool-result", result: null }]],
  ])("%s", (_label, result) => {
    show("event", result);
    expect(merge).not.toHaveBeenCalled();
  });
});

describe("a bare array of rows", () => {
  it("is a finished grounded result", () => {
    show("grounded", [groundedRow("g1", 6.24, -75.58)]);
    expect(merge).toHaveBeenLastCalledWith("grounded", [expect.objectContaining({ id: "grounded-g1" })]);
  });

  it("is not a finished result for any other category (only the grounded tool returns that shape)", () => {
    show("event", [mapped("e1", 6.2, -75.5)]);
    expect(merge).not.toHaveBeenCalled();
  });
});

describe("ToolPinsSync still handles a finished wrapped result", () => {
  it("an AG-UI tool-result carrying a finished payload is normalized and merged", () => {
    show("event", [{ type: "tool-result", result: JSON.stringify({ results: [mapped("e1", 6.2, -75.5)] }) }]);
    expect(merge).toHaveBeenLastCalledWith("event", [expect.objectContaining({ id: "event-e1" })]);
  });

  it("an AG-UI tool-result carrying a finished empty payload clears the category", () => {
    show("event", [{ type: "tool-result", result: JSON.stringify({ results: [] }) }]);
    expect(merge).toHaveBeenLastCalledWith("event", []);
  });
});

describe("grounded results and the other categories", () => {
  it("an empty grounded result clears grounded pins only — rental and event pins stay", () => {
    show("grounded", { source: "grounding", results: [] });
    expect(merge).toHaveBeenCalledTimes(1);
    expect(merge).toHaveBeenCalledWith("grounded", []);
  });

  it("a grounded result with no coordinates also leaves rental and event pins alone", () => {
    show("grounded", { source: "grounding", results: [groundedRow("g1")] });
    expect(merge).toHaveBeenCalledTimes(1);
    expect(merge).toHaveBeenCalledWith("grounded", []);
  });

  it("a grounded result with pins still replaces stale rental and event pins", () => {
    show("grounded", { source: "grounding", results: [groundedRow("g1", 6.24, -75.58)] });
    expect(merge).toHaveBeenCalledWith("rental", []);
    expect(merge).toHaveBeenCalledWith("event", []);
    expect(merge).toHaveBeenLastCalledWith("grounded", [expect.objectContaining({ id: "grounded-g1" })]);
  });
});
