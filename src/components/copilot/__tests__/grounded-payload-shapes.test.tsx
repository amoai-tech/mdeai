// @vitest-environment jsdom
/**
 * SAN-1422 · Make map results truthful and clear stale pins when results have no coordinates.
 * A finished grounded (café / nightlife) result reaches the chat in several shapes. Whatever the
 * shape, the cards and the map must agree: the cards the renter sees are the cards that were
 * returned, and the grounded pins are exactly the cards with coordinates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const ui = vi.hoisted(() => ({ merge: vi.fn() }));

vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ selectedPinId: null, panToPin: vi.fn(), mergePinsByCategory: ui.merge }),
}));
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({ openCafeDetail: vi.fn(), openCafeBooking: vi.fn(), openNightlifeDetail: vi.fn(), openNightlifeBooking: vi.fn() }),
}));
vi.mock("@/components/chat/rich-card-results-context", () => ({
  RichCardResultsRegistrar: () => null,
}));

import { GroundedCafeResults } from "@/components/copilot/search-tool-result-cards";

const place = (coordinates: boolean) => ({
  id: "ChIJcafe",
  title: "Pausa Coffee & Brunch",
  mapsUrl: "https://maps.google.com/?cid=1",
  placeId: "ChIJcafe",
  ...(coordinates ? { latitude: 6.246, longitude: -75.589 } : {}),
});

const envelope = (rows: unknown[]) => ({ results: rows, attribution: [], source: "grounding", metadata: { venueKind: "cafe" } });

type Coverage = "mapped" | "coordinate-less" | "empty";
const rowsFor = (coverage: Coverage) => (coverage === "empty" ? [] : [place(coverage === "mapped")]);

const SHAPES: Array<[string, (rows: unknown[]) => unknown]> = [
  ["a bare array of places", (rows) => rows],
  ["a JSON-encoded array of places", (rows) => JSON.stringify(rows)],
  ["a JSON-encoded envelope", (rows) => JSON.stringify(envelope(rows))],
  ["an AG-UI tool-result wrapping a JSON envelope", (rows) => [{ type: "tool-result", result: JSON.stringify(envelope(rows)) }]],
  ["an AG-UI tool-result wrapping an envelope object", (rows) => [{ type: "tool-result", result: envelope(rows) }]],
];

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  ui.merge.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe.each(SHAPES)("%s", (_name, build) => {
  it.each([
    ["mapped", 1, 1],
    ["coordinate-less", 1, 0],
    ["empty", 0, 0],
  ] as const)("%s → %i card(s), %i grounded pin(s)", (coverage, cards, pins) => {
    act(() => root.render(<GroundedCafeResults result={build(rowsFor(coverage))} />));

    expect(container.querySelectorAll('[data-testid="grounded-card"]')).toHaveLength(cards);
    const groundedCalls = ui.merge.mock.calls.filter(([category]) => category === "grounded");
    expect(groundedCalls, "the finished result reaches the map exactly once").toHaveLength(1);
    expect(groundedCalls[0]?.[1]).toHaveLength(pins);
  });
});

describe("an unfinished grounded result", () => {
  it.each([
    ["null", null],
    ["a half-streamed JSON string", '[{"id": "ChIJcafe", "lat'],
    ["an AG-UI tool-result with no output yet", [{ type: "tool-result", result: null }]],
    ["an AG-UI message part that is not a result", [{ type: "text", text: "searching…" }]],
  ])("%s leaves the map alone", (_label, result) => {
    act(() => root.render(<GroundedCafeResults result={result} />));
    expect(ui.merge).not.toHaveBeenCalled();
  });
});
