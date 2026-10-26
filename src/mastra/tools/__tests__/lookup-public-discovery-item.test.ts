import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupPublicDiscoveryItem } from "../lookup-public-discovery-item";

function client(data: Record<string, unknown> | null) {
  const trace: Array<{ table?: string; fields?: string; id?: string; placeId?: string; kind?: string }> = [];
  const query = {
    select(fields: string) { trace.push({ fields }); return this; },
    eq(name: string, value: string) {
      trace.push(name === "id" ? { id: value } : name === "google_place_id" ? { placeId: value } : { kind: value });
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
  it("resolves Google Place IDs through the public venue anchor, not its UUID", async () => {
    const place = "ChIJ3QqIKDcoRI4RiVE5Rr_jonk";
    const fake = client({ id: "5247d1e6-407f-4822-969f-4f7799ef7124", name: "Dulce Jesús Mío", kind: "nightclub", owner_email: "private" });
    const result = await lookupPublicDiscoveryItem({ page: "nightlife", id: place }, fake.db);
    expect(fake.trace).toContainEqual({ placeId: place });
    expect(fake.trace).toContainEqual({ kind: "nightclub" });
    expect(result.data).not.toHaveProperty("owner_email");
    expect(result.found).toBe(true);
  });
  it("retains UUID lookups for curated café anchors", async () => {
    const id = "5247d1e6-407f-4822-969f-4f7799ef7124";
    const fake = client({ id, name: "Café", kind: "cafe" });
    await lookupPublicDiscoveryItem({ page: "cafes", id }, fake.db);
    expect(fake.trace).toContainEqual({ id });
    expect(fake.trace).not.toContainEqual({ placeId: id });
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
