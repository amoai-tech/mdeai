import { describe, expect, it } from "vitest";
import { closestGroundedResult, parseGroundedRankQuestion } from "../closest-grounded-result";

const A = "37a05b09-f560-4776-92fd-b8bb2b92e611";
const rows = [
  { title: "First Cup", distanceMeters: 85, distanceFromRentalId: A },
  { title: "típica tiendas", distanceMeters: 36, distanceFromRentalId: A },
  { title: "Sabbath", distanceMeters: 124, distanceFromRentalId: A },
];

describe("closestGroundedResult", () => {
  it("returns the smallest measured row for the selected apartment", () => {
    expect(closestGroundedResult(rows, A)).toEqual({
      title: "típica tiendas",
      distanceMeters: 36,
      partial: false,
    });
  });

  it("rejects rows measured from another apartment", () => {
    expect(closestGroundedResult(rows, "e404023e-ad2f-4446-896d-e085ecdacaf1")).toBeNull();
  });

  it("returns the farthest measured row when asked", () => {
    expect(closestGroundedResult(rows, A, "farthest")).toEqual({
      title: "Sabbath",
      distanceMeters: 124,
      partial: false,
    });
  });

  it("qualifies a partial measurement set and ignores invalid numbers", () => {
    const mixed = [...rows, { title: "No distance" }, { title: "Bad", distanceMeters: Number.NaN, distanceFromRentalId: A }];
    expect(closestGroundedResult(mixed, A)?.partial).toBe(true);
  });

  it("returns null when nothing is defensible", () => {
    expect(closestGroundedResult([], A)).toBeNull();
    expect(closestGroundedResult(rows, undefined)).toBeNull();
  });
});

describe("parseGroundedRankQuestion", () => {
  it("recognizes follow-up closest and farthest questions", () => {
    expect(parseGroundedRankQuestion("Which café is closest?")).toBe("closest");
    expect(parseGroundedRankQuestion("Which of these is farthest?")).toBe("farthest");
  });

  it("falls through for new searches and unrelated nearest questions", () => {
    expect(parseGroundedRankQuestion("nearest cafés near this apartment")).toBeNull();
    expect(parseGroundedRankQuestion("show nearest cafés")).toBeNull();
    expect(parseGroundedRankQuestion("Which restaurant is nearest?")).toBeNull();
    expect(parseGroundedRankQuestion("Which apartment is closest?")).toBeNull();
  });
});
