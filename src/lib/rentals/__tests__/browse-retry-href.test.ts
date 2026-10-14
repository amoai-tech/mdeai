import { describe, expect, it } from "vitest";
import { buildRetryHref } from "@/lib/rentals/browse-retry-href";

describe("rental browse retry destination", () => {
  it("keeps the public browse filters", () => {
    expect(buildRetryHref({})).toBe("/rentals");
    expect(buildRetryHref({ neighborhood: "Laureles" })).toBe("/rentals?neighborhood=Laureles");
    expect(buildRetryHref({ neighborhood: "Laureles", beds: "2" })).toBe(
      "/rentals?neighborhood=Laureles&beds=2",
    );
  });

  it("retries the development preview instead of the public browse", () => {
    expect(buildRetryHref({}, true)).toBe("/dev/rentals");
    expect(buildRetryHref({ neighborhood: "Laureles", beds: "2" }, true)).toBe("/dev/rentals");
  });
});
