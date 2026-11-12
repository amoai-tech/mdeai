import { describe, expect, it } from "vitest";
import {
  EVENT_RECOMMENDATIONS_TARGET,
  buildEventRecommendationOps,
  normalizeEventRecommendationIds,
} from "../event-recommendations-ui";

const id = (n: number) => `evt-0000-0000-0000-0000${String(n).padStart(4, "0")}`;

// skipcq: JS-0067 - module-local test helper; not browser global scope
function componentsOf(built: ReturnType<typeof buildEventRecommendationOps>) {
  return (
    built?.operations[0] as {
      createSurface: { components: Array<Record<string, unknown>> };
    }
  ).createSurface.components;
}

describe("event recommendations ops", () => {
  it("emits one EventCard per id on the event-recommendations target", () => {
    const built = buildEventRecommendationOps([id(1), id(2)], "surface-1");
    expect(built?.target).toBe(EVENT_RECOMMENDATIONS_TARGET);
    const components = componentsOf(built);
    expect(components[0]).toMatchObject({ id: "root", component: "Column" });
    expect(components.filter((c) => c.component === "EventCard")).toEqual([
      { id: "card-1", component: "EventCard", eventId: id(1) },
      { id: "card-2", component: "EventCard", eventId: id(2) },
    ]);
  });

  it("drops script, traversal and duplicate ids and caps the surface at four", () => {
    const built = buildEventRecommendationOps(
      ["evt-1<script>alert(1)</script>", "../../etc/passwd", id(1), id(1), id(2), id(3), id(4), id(5)],
      "surface-2",
    );
    const cards = componentsOf(built).filter((c) => c.component === "EventCard");
    expect(cards.map((c) => c.eventId)).toEqual([id(1), id(2), id(3), id(4)]);
  });

  it("returns null when no usable id survives", () => {
    expect(buildEventRecommendationOps([], "surface-3")).toBeNull();
    expect(buildEventRecommendationOps(["<bad>", "a b"], "surface-3")).toBeNull();
    expect(normalizeEventRecommendationIds([id(1)])).toEqual([id(1)]);
  });
});
