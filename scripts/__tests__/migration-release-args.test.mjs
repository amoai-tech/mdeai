import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const check = fileURLToPath(new URL("../require-migration-db-url.mjs", import.meta.url));
const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url))).scripts;
const placeholder = "postgresql://postgres:fake@aws-1-us-east-1.pooler.supabase.com:5432/postgres";

function probe(value) {
  const env = { PATH: process.env.PATH };
  if (value !== undefined) env.SUPABASE_DB_URL = value;
  return spawnSync(process.execPath, [check], { encoding: "utf8", cwd: root, env });
}

describe("migration release input and include-all safety", () => {
  it("fails before a database connection when SUPABASE_DB_URL is unset", () => {
    const r = probe(undefined);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /SUPABASE_DB_URL.*(unset|missing)/i);
    assert.doesNotMatch(r.stderr, /fake|password/i);
  });

  it("rejects invalid connection strings without disclosing credentials", () => {
    for (const url of ["", "not-an-url", "http://user:secret@localhost/test"]) {
      const r = probe(url);
      assert.equal(r.status, 1);
      assert.doesNotMatch(r.stderr + r.stdout, /secret|not-an-url/);
    }
  });

  it("accepts a parsed Postgres URL silently", () => {
    const r = probe(placeholder);
    assert.equal(r.status, 0);
    assert.equal(r.stdout + r.stderr, "");
  });

  it("passes --include-all to BOTH the dry run and the guarded write", () => {
    assert.match(scripts["migration:dry-run:include-all"], /--dry-run.*--include-all/);
    assert.match(scripts["push:migration:include-all"], /preflight:migration.*migration:dry-run:include-all.*confirm-migration-push.*db push.*--include-all/);
  });

  it("guards both the standard and include-all dry runs against missing credentials", () => {
    assert.match(scripts["migration:dry-run"], /require-migration-db-url\.mjs/);
    assert.match(scripts["migration:dry-run:include-all"], /require-migration-db-url\.mjs/);
    assert.doesNotMatch(scripts["push:migration:include-all"], /--include-seed|migration repair|db reset/);
  });
});
