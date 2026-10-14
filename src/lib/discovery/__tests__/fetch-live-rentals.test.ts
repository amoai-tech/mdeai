import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLiveRentals } from "@/lib/discovery/fetch-discovery-rows";

/** A fake builder that records filters and resolves with the given rows. */
function fakeClient(rows: Array<Record<string, unknown>>) {
  const calls: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "or", "order", "limit"]) {
    chain[m] = (...args: unknown[]) => { calls.push(`${m}(${args.map(String).join(",")})`); return chain; };
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  return { client: { from: () => chain } as unknown as SupabaseClient, calls };
}

const row = (over: Record<string, unknown>) => ({
  id: "r1", title: "Loft", neighborhood: "Laureles", price_monthly: 1500, bedrooms: 2, wifi_speed: 100,
  utilities_included: true, pet_friendly: true, images: ["x.jpg"], rating: null, available_from: "2000-01-01", ...over,
});

describe("homepage rental discovery (SAN-486)", () => {
  it("asks only for listings with a known move-in date that have not expired", async () => {
    const { client, calls } = fakeClient([]);
    await fetchLiveRentals(client);
    expect(calls).toContain("not(available_from,is,null)");
    expect(calls.some((c) => /^or\(available_to\.is\.null,available_to\.gte\.\d{4}-\d{2}-\d{2}\)$/.test(c))).toBe(true);
  });

  it("shows the upcoming move-in date even when the card has many descriptive hints", async () => {
    const { client } = fakeClient([row({ available_from: "2099-11-01" })]);
    const [card] = await fetchLiveRentals(client);
    expect(card.why).toMatch(/^Available from Nov 1, 2099 · /);
    expect(card.why).not.toMatch(/available now/i);
  });

  it("says 'Available now' only for a move-in date that has passed", async () => {
    const { client } = fakeClient([row({ available_from: "2000-01-01", utilities_included: false, pet_friendly: false, bedrooms: null, wifi_speed: null })]);
    const [card] = await fetchLiveRentals(client);
    expect(card.why).toBe("Available now in Laureles.");
  });
});
