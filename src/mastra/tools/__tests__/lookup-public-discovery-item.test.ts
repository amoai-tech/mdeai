import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupPublicDiscoveryItem } from "../lookup-public-discovery-item";
import { NON_QA_EVENT_SLUG_FILTER, QA_EVENT_NAME_SQL_PATTERN } from "@/lib/events/public-event-fixtures";

function client(data: Record<string, unknown> | null, fallback?: Record<string, unknown> | null) {
  const trace: Array<Record<string, unknown>> = [];
  return {
    trace,
    db: { from(table: string) {
      trace.push({ table });
      return {
        select(fields: string) { trace.push({ fields }); return this; },
        eq(name: string, value: unknown) {
          trace.push(name === "id" ? { id: value } : name === "google_place_id" ? { placeId: value } : name === "kind" ? { kind: value } : { column: name, value });
          return this;
        },
        in(name: string, values: string[]) { trace.push({ column: name, values }); return this; },
        not(name: string, operator: string, value: string) { trace.push({ not: name, operator, value }); return this; },
        or(filter: string) { trace.push({ or: filter }); return this; },
        maybeSingle() { return Promise.resolve({ data: table === "restaurants" && fallback !== undefined ? fallback : data, error: null }); },
      };
    } } as unknown as SupabaseClient,
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
  it("only falls back to a server-confirmed public restaurant UUID after a missing café anchor", async () => {
    const id = "5247d1e6-407f-4822-969f-4f7799ef7124";
    const fake = client(null, { id, name: "Café from public restaurant search", cuisine_types: ["cafe"], owner_private_email: "hidden" });
    const result = await lookupPublicDiscoveryItem({ page: "cafes", id }, fake.db);
    expect(fake.trace.filter((t) => t.table)).toEqual([{ table: "venue_anchors" }, { table: "restaurants" }]);
    expect(fake.trace).toContainEqual({ kind: "cafe" });
    expect(result).toMatchObject({ found: true, data: { id, name: "Café from public restaurant search" } });
    expect(result.data).not.toHaveProperty("owner_private_email");
  });
  it("never trusts a forged café ID or uses a restaurant lookup for a Google Place ID", async () => {
    const id = "5247d1e6-407f-4822-969f-4f7799ef7124";
    const hidden = client(null, null);
    expect(await lookupPublicDiscoveryItem({ page: "cafes", id }, hidden.db)).toEqual({ found: false, data: null });
    const google = client(null, { id, name: "Not a source for the requested Place ID" });
    expect(await lookupPublicDiscoveryItem({ page: "cafes", id: "ChIJ3QqIKDcoRI4RiVE5Rr_jonk" }, google.db)).toEqual({ found: false, data: null });
    expect(google.trace.filter((t) => t.table)).toEqual([{ table: "venue_anchors" }]);
    const nightlife = client(null, { id, name: "Restaurant must not be a nightclub" });
    expect(await lookupPublicDiscoveryItem({ page: "nightlife", id }, nightlife.db)).toEqual({ found: false, data: null });
    expect(nightlife.trace.filter((t) => t.table)).toEqual([{ table: "venue_anchors" }]);
  });
  it("restricts event selection to the same public catalog predicates and fixed columns", async () => {
    const id = "5247d1e6-407f-4822-969f-4f7799ef7124";
    const fake = client({ id, name: "Real concert", address: "Medellín", event_start_time: "2026-11-03T23:00:00Z", currency: "COP", organizer_email: "hidden" });
    const result = await lookupPublicDiscoveryItem({ page: "events", id }, fake.db);
    expect(fake.trace).toContainEqual({ column: "is_active", value: true });
    expect(fake.trace).toContainEqual({ column: "status", values: ["published", "live"] });
    expect(fake.trace).toContainEqual({ not: "name", operator: "imatch", value: QA_EVENT_NAME_SQL_PATTERN });
    expect(fake.trace).toContainEqual({ or: NON_QA_EVENT_SLUG_FILTER });
    expect(result.data).toMatchObject({ id, name: "Real concert" });
    expect(result.data).not.toHaveProperty("organizer_email");
    expect(fake.trace.find((t) => t.fields)?.fields).toBe("id, name, address, event_start_time, currency");
    const hidden = client(null);
    expect(await lookupPublicDiscoveryItem({ page: "events", id }, hidden.db)).toEqual({ found: false, data: null });
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
