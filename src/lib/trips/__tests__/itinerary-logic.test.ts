import { describe, expect, it } from "vitest";
import {
  detectScheduleOverlaps,
  formatItemTimeRange,
  formatTripDateTime,
  getUpNextItem,
  groupTripItemsByDay,
} from "../itinerary-logic";
import type { TripItemRow } from "../trip-item-types";
import { resolveTripTimeZone } from "../timezone";

const base = (over: Partial<TripItemRow>): TripItemRow => ({
  id: over.id ?? "1",
  item_type: over.item_type ?? "event",
  source_id: over.source_id ?? "11111111-1111-4111-8111-111111111111",
  created_at: over.created_at ?? "2026-11-01T00:00:00.000Z",
  title: over.title ?? "Item",
  description: null,
  start_at: over.start_at ?? null,
  end_at: over.end_at ?? null,
  location_name: over.location_name ?? null,
  latitude: null,
  longitude: null,
});

describe("groupTripItemsByDay", () => {
  it("groups items by start_at date and sorts chronologically", () => {
    const groups = groupTripItemsByDay([
      base({
        id: "b",
        title: "Evening",
        start_at: "2026-06-21T20:00:00.000Z",
      }),
      base({
        id: "a",
        title: "Morning",
        start_at: "2026-06-20T10:00:00.000Z",
      }),
      base({ id: "c", title: "TBD" }),
    ]);

    expect(groups.map((g) => g.dayKey)).toEqual([
      "2026-06-20",
      "2026-06-21",
      "unscheduled",
    ]);
    expect(groups[0].items[0].id).toBe("a");
    expect(groups[2].label).toBe("Unscheduled");
  });
});

describe("trip-local timezone", () => {
  it("falls back to Bogotá for an invalid owner-controlled value", () => {
    expect(resolveTripTimeZone("Bogota")).toBe("America/Bogota");
    const late = base({
      start_at: "2026-11-22T04:30:00.000Z",
    });
    expect(() => groupTripItemsByDay([late], "Bogota")).not.toThrow();
    expect(groupTripItemsByDay([late], "Bogota")[0].dayKey).toBe("2026-11-21");
  });

  it("uses the trip timezone for the day key and displayed time", () => {
    const late = base({
      id: "late",
      title: "Late dinner",
      start_at: "2026-11-22T04:30:00.000Z",
    });

    const bogota = groupTripItemsByDay([late], "America/Bogota");
    const tokyo = groupTripItemsByDay([late], "Asia/Tokyo");

    expect(bogota[0].dayKey).toBe("2026-11-21");
    expect(tokyo[0].dayKey).toBe("2026-11-22");
    expect(formatItemTimeRange(late, "America/Bogota")).toContain("11:30 PM");
    expect(formatTripDateTime(late.start_at!, "America/Bogota")).toContain(
      "Sat, Nov 21",
    );
  });
});

describe("deterministic ordering", () => {
  it("orders equal start times by created_at then id", () => {
    const groups = groupTripItemsByDay([
      base({
        id: "b",
        start_at: "2026-11-21T20:00:00.000Z",
        created_at: "2026-11-01T00:00:02.000Z",
      }),
      base({
        id: "a",
        start_at: "2026-11-21T20:00:00.000Z",
        created_at: "2026-11-01T00:00:01.000Z",
      }),
    ]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("getUpNextItem", () => {
  it("returns the first persisted stop at or after now", () => {
    const next = getUpNextItem(
      [
        base({ id: "earlier", start_at: "2026-11-20T20:00:00.000Z" }),
        base({ id: "next", start_at: "2026-11-21T20:00:00.000Z" }),
      ],
      new Date("2026-11-21T00:00:00.000Z"),
    );
    expect(next?.id).toBe("next");
  });
});

describe("detectScheduleOverlaps", () => {
  it("flags overlapping windows on the same day", () => {
    const overlaps = detectScheduleOverlaps([
      base({
        id: "a",
        title: "Salsa",
        start_at: "2026-06-21T20:00:00.000Z",
        end_at: "2026-06-21T23:00:00.000Z",
      }),
      base({
        id: "b",
        title: "Dinner",
        start_at: "2026-06-21T19:30:00.000Z",
        end_at: "2026-06-21T21:00:00.000Z",
      }),
    ]);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].itemATitle).toMatch(/Salsa|Dinner/);
    expect(overlaps[0].message).toMatch(/overlap/i);
  });

  it("returns empty when items are on different days", () => {
    const overlaps = detectScheduleOverlaps([
      base({
        id: "a",
        start_at: "2026-06-20T20:00:00.000Z",
        end_at: "2026-06-20T23:00:00.000Z",
      }),
      base({
        id: "b",
        start_at: "2026-06-21T19:30:00.000Z",
        end_at: "2026-06-21T21:00:00.000Z",
      }),
    ]);
    expect(overlaps).toHaveLength(0);
  });
});
