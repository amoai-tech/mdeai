/**
 * SAN-1089 — a configured but unreachable database is an outage, not a generic failure: the
 * detail loader must throw RentalSearchUnavailableError (so the page says "temporarily
 * unavailable") and must not carry the driver message.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let queryResult: { data: unknown; error: { message: string; code?: string } | null } = {
  data: null,
  error: null,
};

vi.mock("@/lib/supabase/server-env", () => ({
  getSupabaseServerAnonEnv: () => ({ url: "https://example.supabase.co", anonKey: "anon-test-key" }),
}));
vi.mock("@supabase/supabase-js", () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "limit"]) builder[method] = () => builder;
  builder.maybeSingle = async () => queryResult;
  return { createClient: () => ({ from: () => builder }) };
});

import { RentalSearchUnavailableError } from "@/mastra/lib/rental-search-unavailable";
import { getRentalDetail } from "../get-rental-detail";

beforeEach(() => {
  queryResult = { data: null, error: null };
});

describe("getRentalDetail with a configured client", () => {
  it("throws RentalSearchUnavailableError when the query fails, without the driver message", async () => {
    queryResult = {
      data: null,
      error: { message: "connection refused to db.prod.internal:5432", code: "08006" },
    };
    const failure = (await getRentalDetail("abc").catch((error: unknown) => error)) as Error;
    expect(failure).toBeInstanceOf(RentalSearchUnavailableError);
    expect(failure.message).toContain("08006");
    expect(failure.message).not.toContain("db.prod.internal");
  });

  it("returns null (a 404) for a rental that is simply not there", async () => {
    queryResult = { data: null, error: null };
    await expect(getRentalDetail("abc")).resolves.toBeNull();
  });
});
