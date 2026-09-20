import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260920130000_san1284c_trigger_internal_function_acls.sql"),
  "utf8",
);

describe("SAN-1284C trigger ACL migration", () => {
  it("hardens production-only app trigger functions through a catalog catch-all", () => {
    expect(migration).toContain("p.prorettype = 'trigger'::regtype");
    expect(migration).toContain("pg_depend");
    expect(migration).toContain("pg_extension");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });
});
