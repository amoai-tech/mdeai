import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchBrokerListings } from "../fetch-broker-listings";

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
  it("filters by landlord before applying the bounded range", () => {
    const ownershipFilter = SOURCE.indexOf('.in("landlord_id", landlordProfileIds)');
    const limit = SOURCE.indexOf(".range(offset, offset + limit - 1)");

    expect(ownershipFilter, "landlord_id filter must exist").toBeGreaterThan(-1);
    expect(limit, "the row limit must exist").toBeGreaterThan(-1);
    expect(
      ownershipFilter,
      "ownership must be filtered in the query, before the limit",
    ).toBeLessThan(limit);
  });

  it("returns no inventory when the broker has no landlord profile", () => {
    expect(SOURCE).toContain("if (landlordProfileIds.length === 0)");
    expect(SOURCE).toContain("return { ok: true, listings: [], landlordProfileIds: [], displayName: null, total: 0, offset }");
  });

  it("keeps the in-memory ownership filter as defence in depth", () => {
    expect(SOURCE).toContain("filterOwnedBrokerListings(mapped, landlordProfileIds)");
  });
});

describe("SAN-1684 paged broker inventory", () => {
  it("returns the exact total and scoped second page with stable ordering", async () => {
    const profiles = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [{ id: "profile-a", display_name: "Broker A" }], error: null }),
    };
    const apartments = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ id: "apt-201", title: "Owned unit", landlord_id: "profile-a", listing_workflow_status: "draft" }],
        count: 251, error: null,
      }),
    };
    const from = vi.fn((name: string) => name === "landlord_profiles" ? profiles : apartments);
    const client = { from } as unknown as SupabaseClient<Database>;
    const result = await fetchBrokerListings(client, "user-a", { offset: 200, limit: 50 });
    expect(result).toMatchObject({ ok: true, total: 251, offset: 200, listings: [{ id: "apt-201" }] });
    expect(profiles.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(apartments.in).toHaveBeenCalledWith("landlord_id", ["profile-a"]);
    expect(apartments.order.mock.calls).toEqual([["updated_at", { ascending: false }], ["id", { ascending: true }]]);
    expect(apartments.range).toHaveBeenCalledWith(200, 249);
    expect(from.mock.calls).toEqual([["landlord_profiles"], ["apartments"]]);
  });

  it("rejects an invalid or oversized page before querying", async () => {
    const from = vi.fn();
    const client = { from } as unknown as SupabaseClient<Database>;
    for (const page of [{ offset: -1 }, { limit: 201 }, { limit: 0 }, { offset: 0.5 }]) {
      expect(await fetchBrokerListings(client, "user-a", page)).toMatchObject({ ok: false });
    }
    expect(from).not.toHaveBeenCalled();
  });
});
