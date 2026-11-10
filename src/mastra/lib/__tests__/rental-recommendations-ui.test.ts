import { describe, expect, it } from "vitest";
import {
  RENTAL_RECOMMENDATIONS_TARGET,
  buildRentalRecommendationOps,
  normalizeRecommendationIds,
} from "../rental-recommendations-ui";

const id = (n: number) => `37a05b09-f560-4776-92fd-b8bb2b92e6${String(n).padStart(2, "0")}`;

describe("normalizeRecommendationIds", () => {
  it("keeps unique safe IDs up to four", () => {
    expect(normalizeRecommendationIds([id(1), id(1), id(2), id(3), id(4), id(5)])).toEqual([
      id(1), id(2), id(3), id(4),
    ]);
  });

  it("drops unsafe, empty and oversized tokens", () => {
    expect(normalizeRecommendationIds(["", " ", "a b", "<x>", "a".repeat(129), id(1)])).toEqual([id(1)]);
  });
});

describe("buildRentalRecommendationOps", () => {
  it("builds a versioned createSurface with a container root and one card per ID", () => {
    const built = buildRentalRecommendationOps([id(1), id(2)], "recs-1");
    expect(built?.target).toBe(RENTAL_RECOMMENDATIONS_TARGET);
    const op = built?.operations[0] as { version: string; createSurface: { surfaceId: string; components: Array<Record<string, unknown>> } };
    expect(op.version).toBe("1.0");
    expect(op.createSurface.surfaceId).toBe("recs-1");
    expect(op.createSurface.components[0]).toEqual({ id: "root", component: "Column", children: ["card-1", "card-2"] });
    expect(op.createSurface.components[1]).toEqual({ id: "card-1", component: "RentalCard", listingId: id(1) });
    expect(op.createSurface.components[2]).toEqual({ id: "card-2", component: "RentalCard", listingId: id(2) });
  });

  it("returns null when nothing valid remains", () => {
    expect(buildRentalRecommendationOps(["", " "], "recs-1")).toBeNull();
  });

  it("never puts facts or model text into the operation", () => {
    const built = JSON.stringify(buildRentalRecommendationOps([id(1)], "recs-1"));
    expect(built).not.toMatch(/price|title|neighborhood|photo/i);
  });
});
