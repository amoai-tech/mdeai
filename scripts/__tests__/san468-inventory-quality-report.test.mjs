import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const sqlPath = fileURLToPath(new URL("../sql/san468-inventory-quality-report.sql", import.meta.url));
const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));

/** Write/DDL keywords that would make the "read-only" report a mutation. */
const WRITE_KEYWORDS = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create)\b/i;

function executableLines(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

test("inventory-quality report is read-only", () => {
  const executable = executableLines(readFileSync(sqlPath, "utf8"));
  assert.equal(
    WRITE_KEYWORDS.test(executable),
    false,
    "report SQL must not contain a write/DDL keyword outside comments",
  );
  assert.match(executable, /^\s*with\s+base\s+as/im);
  assert.match(executable, /json_build_object/i);
});

test("every readiness flag excludes metadata.is_test_fixture rows", () => {
  const executable = executableLines(readFileSync(sqlPath, "utf8"));
  const start = executable.indexOf("verdict as (");
  const end = executable.indexOf("detail as (");
  assert.ok(start > 0 && end > start, "verdict block must exist");
  const verdict = executable.slice(start, end);
  let cursor = 0;
  for (const flag of ["searchable", "map_ready", "launch_ready", "requestable"]) {
    const idx = verdict.indexOf("as " + flag);
    assert.ok(idx > 0, flag + " must be present");
    const expression = verdict.slice(cursor, idx);
    assert.ok(expression.includes("not f.is_test_fixture"), flag + " must exclude test fixtures");
    cursor = idx;
  }
});

test("inventory-quality npm script is wired", () => {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  assert.match(
    pkg.scripts["verify:inventory-quality"],
    /verify-rental-inventory-quality\.mjs/,
  );
});

const runnerPath = fileURLToPath(
  new URL("../verify-rental-inventory-quality.mjs", import.meta.url),
);

test("fails (exit 1) when a configured database is unreachable", () => {
  const result = spawnSync(
    process.execPath,
    [runnerPath, "--database-url=postgresql://postgres:postgres@127.0.0.1:1/postgres"],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /configured DB is unreachable/);
});

test("skips with exit 0 when no database URL is configured", () => {
  const env = { ...process.env };
  delete env.SUPABASE_DB_URL;
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, [runnerPath], {
    encoding: "utf8",
    env,
    timeout: 30_000,
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /SKIP inventory-quality report/);
});
