import { describe, expect, it } from "vitest";
import { filterCustomerVisibleRentalRankExplanation } from "@/components/copilot/search-tool-result-cards";

describe("rental rank explanation visibility", () => {
  it("keeps customer-facing reasons and hides internal search failures", () => {
    const visible = filterCustomerVisibleRentalRankExplanation([
      { factor: "embed_failed", score: 0, note: "missing_key" },
      { factor: "hybrid_rpc_error", score: 0, note: "service unavailable" },
      { factor: "neighborhood", score: 1, note: "El Poblado filter" },
    ]);

    expect(visible).toEqual([
      { factor: "neighborhood", score: 1, note: "El Poblado filter" },
    ]);
  });
});
