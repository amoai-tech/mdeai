import { describe, expect, it, vi } from "vitest";
import type { deleteThrowawayIdentity, getSupabaseAdmin, ThrowawayIdentity } from "./auth";
import { cleanupBrokerOnboarding } from "./cleanup-broker-onboarding";

type Row = Record<string, string>;

function fixture(options: { blockedDelete?: boolean; silentNoop?: boolean; noProfile?: boolean } = {}) {
  const rows: Record<string, Row[]> = {
    landlord_profiles: options.noProfile ? [] : [
      { id: "owned-profile", user_id: "owner" },
      { id: "another-profile", user_id: "someone-else" },
    ],
    apartments: options.noProfile ? [] : [
      { id: "owned-listing-1", landlord_id: "owned-profile" },
      { id: "owned-listing-2", landlord_id: "owned-profile" },
      { id: "other-listing", landlord_id: "another-profile" },
    ],
  };
  const operations: string[] = [];
  const admin = {
    from(table: string) {
      let method = "select";
      const checks: ((row: Row) => boolean)[] = [];
      const query = {
        select(fields: string) { void fields; method = "select"; return query; },
        delete() { method = "delete"; return query; },
        eq(field: string, value: string) { checks.push((r) => r[field] === value); return query; },
        in(field: string, values: string[]) { checks.push((r) => values.includes(r[field])); return query; },
        then(resolve: (result: { data: Row[]; error: { message: string } | null }) => unknown) {
          const matching = rows[table].filter((r) => checks.every((p) => p(r)));
          operations.push(`${method}:${table}:${matching.map((r) => r.id).join(",")}`);
          if (method === "delete") {
            if (options.blockedDelete && table === "apartments") return Promise.resolve(resolve({ data: [], error: { message: "DB permission denied" } }));
            if (!options.silentNoop) rows[table] = rows[table].filter((r) => !matching.includes(r));
          }
          return Promise.resolve(resolve({ data: method === "select" ? matching : [], error: null }));
        },
      };
      return query;
    },
  } as unknown as Awaited<ReturnType<typeof getSupabaseAdmin>>;
  const removeIdentity = vi.fn(async (identity: ThrowawayIdentity) => { void identity; });
  const identity: ThrowawayIdentity = { userId: "owner", email: "qa@qa-isolation.mdeai.co" };
  return { admin, rows, operations, removeIdentity: removeIdentity as typeof deleteThrowawayIdentity, identity };
}

describe("SAN-677 broker onboarding E2E teardown", () => {
  it("deletes only this run's listings and broker profile, then the identity", async () => {
    const x = fixture();
    await cleanupBrokerOnboarding(x.admin, x.identity, x.removeIdentity);
    expect(x.rows.apartments).toEqual([{ id: "other-listing", landlord_id: "another-profile" }]);
    expect(x.rows.landlord_profiles).toEqual([{ id: "another-profile", user_id: "someone-else" }]);
    expect(x.removeIdentity).toHaveBeenCalledExactlyOnceWith(x.identity);
    expect(x.operations.indexOf("delete:landlord_profiles:owned-profile")).toBeGreaterThan(x.operations.indexOf("delete:apartments:owned-listing-1,owned-listing-2"));
  });
  it("retains the identity for recovery if DB rejects listing deletion", async () => {
    const x = fixture({ blockedDelete: true });
    await expect(cleanupBrokerOnboarding(x.admin, x.identity, x.removeIdentity)).rejects.toThrow("DB permission denied");
    expect(x.removeIdentity).not.toHaveBeenCalled();
    expect(x.rows.apartments).toHaveLength(3);
  });
  it("fails closed when a deletion reports success but records remain", async () => {
    const x = fixture({ silentNoop: true });
    await expect(cleanupBrokerOnboarding(x.admin, x.identity, x.removeIdentity)).rejects.toThrow("Test broker listings remain");
    expect(x.removeIdentity).not.toHaveBeenCalled();
  });
  it("cleans the identity when the UI failed before a broker profile was created", async () => {
    const x = fixture({ noProfile: true });
    await cleanupBrokerOnboarding(x.admin, x.identity, x.removeIdentity);
    expect(x.removeIdentity).toHaveBeenCalledExactlyOnceWith(x.identity);
  });
});
