import { describe, expect, it } from "vitest";

describe("SAN-458 branch protection proof", () => {
  it("passes so Floor goes green while review protection still blocks merge", () => {
    expect("floor-blocks-bad-code").toBe("floor-blocks-bad-code");
  });
});
