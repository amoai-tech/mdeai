/**
 * SAN-1422 · Make map results truthful and clear stale pins when results have no coordinates.
 * The chat summary may only mention map pins that exist. Result count and pin count can differ.
 */
import { describe, expect, it } from "vitest";
import { fastPathAssistantSummary } from "@/lib/event-search-fast-path";
import { fastPathRestaurantSummary } from "@/lib/restaurant-search-fast-path";
import { fastPathCafeSummary } from "@/lib/cafe-search-fast-path";
import { fastPathRentalSummary } from "@/lib/rental-display";

const cases = [
  {
    name: "rentals",
    summary: (results: number, pins: number) => fastPathRentalSummary(results, pins),
    noun: "rental",
  },
  {
    name: "events",
    summary: (results: number, pins: number) => fastPathAssistantSummary(results, pins),
    noun: "event",
  },
  {
    name: "restaurants",
    summary: (results: number, pins: number) => fastPathRestaurantSummary(results, pins, "Poblado"),
    noun: "restaurant",
  },
  {
    name: "cafés",
    summary: (results: number, pins: number) => fastPathCafeSummary(results, pins, "Poblado", "best cafes"),
    noun: "coffee shop",
  },
] as const;

describe.each(cases)("$name summary", ({ summary, noun }) => {
  it("all results mapped: promises pins on the map", () => {
    expect(summary(3, 3)).toMatch(/pins on the map/);
  });

  it("some results mapped: says how many are on the map, not that every one is", () => {
    const text = summary(5, 3);
    expect(text).toMatch(/5/);
    expect(text).toMatch(/3 shown on (the )?map/);
    expect(text).not.toMatch(/pins on the map/);
  });

  it("no results mapped: keeps the cards but makes no promise of pins", () => {
    const text = summary(2, 0);
    expect(text).toContain(noun);
    expect(text).toMatch(/location/i);
    expect(text).not.toMatch(/pins? on the map/);
  });

  it("no results: the normal no-results wording, never a pin claim", () => {
    const text = summary(0, 0);
    expect(text).toMatch(/No /);
    expect(text).not.toMatch(/pin/);
  });
});
