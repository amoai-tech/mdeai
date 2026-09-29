import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAN-1204 · Codex P2 — ownership must be filtered in the query, not after the row limit.
 *
 * The apartments query used to run `.order(...).limit(200)` with no landlord filter and then
 * discard other brokers' rows in memory. That meant it fetched the 200 most recently updated
 * apartments visible under RLS across the whole marketplace, so a broker whose listing fell
 * outside that window lost their own listing. The viewing-request card then fell back to the
 * generic "Your listing" label instead of naming the apartment.
 *
 * This is a source-order assertion on purpose: the defect is the *order* of the builder calls,
 * which no amount of mocked-return testing would catch.
 */
const SOURCE = readFileSync(join(import.meta.dirname, "..", "fetch-broker-listings.ts"), "utf8");

describe("fetchBrokerListings ownership scoping", () => {
  it("filters by landlord before applying the 200-row limit", () => {
    const ownershipFilter = SOURCE.indexOf('.in("landlord_id", landlordProfileIds)');
    const limit = SOURCE.indexOf(".limit(200)");

    expect(ownershipFilter, "landlord_id filter must exist").toBeGreaterThan(-1);
    expect(limit, "the row limit must exist").toBeGreaterThan(-1);
    expect(
      ownershipFilter,
      "ownership must be filtered in the query, before the limit",
    ).toBeLessThan(limit);
  });

  it("returns no inventory when the broker has no landlord profile", () => {
    expect(SOURCE).toContain("if (landlordProfileIds.length === 0)");
    expect(SOURCE).toContain("return { ok: true, listings: [], landlordProfileIds: [] }");
  });

  it("keeps the in-memory ownership filter as defence in depth", () => {
    expect(SOURCE).toContain("filterOwnedBrokerListings(mapped, landlordProfileIds)");
  });
});
