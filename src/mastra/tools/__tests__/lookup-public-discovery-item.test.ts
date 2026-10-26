import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupPublicDiscoveryItem } from "../lookup-public-discovery-item";

function client(data: Record<string, unknown> | null) {
  const trace: Array<{ table?: string; fields?: string; id?: string; kind?: string }> = [];
  const query = {
    select(fields: string) { trace.push({ fields }); return this; },
    eq(name: string, value: string) {
      trace.push(name === "id" ? { id: value } : { kind: value });
      return this;
    },
    maybeSingle() { return Promise.resolve({ data, error: null }); },
  };
  return {
    trace,
    db: { from(table: string) { trace.push({ table }); return query; } } as unknown as SupabaseClient,
  };
}
describe("server-side public selection lookup", () => {
  it("re-fetches a restaurant by public ID and strips unexpected/private fields", async () => {
    const fake = client({
      id: "restaurant-01", name: "Local", neighborhood: "Laureles",
      cuisine_types: ["italian"], price_level: null, rating: 4.5,
      owner_private_email: "must-not-leak",
    });
    const result = await lookupPublicDiscoveryItem({ page: "restaurants", id: "restaurant-01" }, fake.db);
    expect(result).toMatchObject({ found: true, data: { id: "restaurant-01", name: "Local" } });
    expect(result.data).not.toHaveProperty("owner_private_email");
    expect(fake.trace).toContainEqual({ table: "restaurants" });
    expect(fake.trace).toContainEqual({ id: "restaurant-01" });
    expect(fake.trace.find((t) => t.fields)?.fields).not.toContain("*");
  });
  it("returns no selected facts when RLS hides a forged or cross-user ID", async () => {
    const fake = client(null);
    const result = await lookupPublicDiscoveryItem({ page: "rentals", id: "forged-private-id" }, fake.db);
    expect(result).toEqual({ found: false, data: null });
    expect(fake.trace).toContainEqual({ table: "apartments" });
  });
  it("checks the right venue kind, not just any venue anchor ID", async () => {
    const fake = client({ id: "a", name: "Cafe", kind: "cafe" });
    await lookupPublicDiscoveryItem({ page: "cafes", id: "a" }, fake.db);
    expect(fake.trace).toContainEqual({ kind: "cafe" });
    const other = client(null);
    await lookupPublicDiscoveryItem({ page: "nightlife", id: "a" }, other.db);
    expect(other.trace).toContainEqual({ kind: "nightclub" });
  });
});
