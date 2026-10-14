/**
 * SAN-1089 — an unreadable database is "search unavailable", never demo apartments and never a
 * healthy-looking empty marketplace.
 *
 * Own file so the module-level Supabase client cache starts fresh for every case
 * (`vi.resetModules()` + dynamic import).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown[] | null; error: { message: string } | null; count: number | null };

let anonEnv: { url: string; anonKey: string } | null = null;
let queryResult: QueryResult = { data: [], error: null, count: 0 };

vi.mock("@/lib/supabase/server-env", () => ({
  getSupabaseServerAnonEnv: () => anonEnv,
}));

/** Chainable, awaitable stand-in for the PostgREST builder. */
function mockQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of [
    "select", "eq", "not", "or", "order", "limit", "ilike", "gte", "in", "is",
  ]) {
    builder[method] = chain;
  }
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(queryResult);
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => mockQueryBuilder() }),
}));

async function load() {
  vi.resetModules();
  const tool = await import("../search-rentals");
  const unavailable = await import("../../lib/rental-search-unavailable");
  return { ...tool, ...unavailable };
}

beforeEach(() => {
  anonEnv = { url: "https://example.supabase.co", anonKey: "anon-test-key" };
  queryResult = { data: [], error: null, count: 0 };
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("SAN-1089 · searchRentals never invents apartments", () => {
  it("throws RentalSearchUnavailableError when no Supabase credentials resolve (structured path)", async () => {
    anonEnv = null;
    const { searchRentals, RentalSearchUnavailableError } = await load();
    await expect(searchRentals({ limit: 8 })).rejects.toBeInstanceOf(RentalSearchUnavailableError);
  });

  it("throws, instead of returning an empty 'mock' success, when credentials are missing on the queryText path", async () => {
    anonEnv = null;
    const { searchRentals, RentalSearchUnavailableError } = await load();
    await expect(
      searchRentals({ queryText: "apartments in Laureles", limit: 8 }),
    ).rejects.toBeInstanceOf(RentalSearchUnavailableError);
  });

  it("throws when the database query itself fails, and the error carries no demo rows", async () => {
    queryResult = { data: null, error: { message: "connection refused" }, count: null };
    const { searchRentals, RentalSearchUnavailableError } = await load();
    const failure = await searchRentals({ limit: 8 }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(RentalSearchUnavailableError);
    expect((failure as InstanceType<typeof RentalSearchUnavailableError>).code).toBe(
      "rental_search_unavailable",
    );
  });

  it("a healthy query with zero eligible rows is a SUCCESSFUL empty result from supabase", async () => {
    queryResult = { data: [], error: null, count: 0 };
    const { searchRentals } = await load();
    const result = await searchRentals({ limit: 8 });
    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.source).toBe("supabase");
  });

  it("never returns a result whose source is 'mock'", async () => {
    const { searchRentals } = await load();
    const result = await searchRentals({ neighborhood: "Laureles", minBedrooms: 2, limit: 8 });
    expect(result.source).not.toBe("mock");
  });
});

describe("SAN-1089 · logs never carry driver messages", () => {
  const SIMULATED_DB_ERROR = "connection refused to db.prod.internal:5432";

  function loggedText() {
    return [...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls]
      .flat()
      .map((value) => (value instanceof Error ? `${value.name}: ${value.message}` : String(value)))
      .join(" | ");
  }

  it("a failing query logs a stable code, not the driver message", async () => {
    queryResult = { data: null, error: { message: SIMULATED_DB_ERROR, code: "08006" } as never, count: null };
    const { searchRentals } = await load();
    await searchRentals({ limit: 8 }).catch(() => undefined);
    const logged = loggedText();
    expect(logged).toContain("rental search unavailable");
    expect(logged).toContain("08006");
    expect(logged).not.toContain("db.prod.internal");
    expect(logged).not.toContain(SIMULATED_DB_ERROR);
  });

  it("the error thrown to callers carries the sanitized reason only", async () => {
    queryResult = { data: null, error: { message: SIMULATED_DB_ERROR, code: "08006" } as never, count: null };
    const { searchRentals } = await load();
    const failure = (await searchRentals({ limit: 8 }).catch((error: unknown) => error)) as Error;
    expect(failure.message).not.toContain("db.prod.internal");
  });
});

describe("SAN-1089 · the Mastra tool surfaces an outage as an error", () => {
  it("does not describe or promise demo data to the agent", async () => {
    const { searchRentalsTool } = await load();
    expect(searchRentalsTool.description).not.toMatch(/demo|mock|fall(s)? back/i);
  });
});
