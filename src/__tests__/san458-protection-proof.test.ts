import { describe, expect, it } from "vitest";

describe("SAN-458 branch protection proof", () => {
  it("fails deliberately so Floor must block merge", () => {
    expect("floor-blocks-bad-code").toBe("merge-allowed");
  });
});
