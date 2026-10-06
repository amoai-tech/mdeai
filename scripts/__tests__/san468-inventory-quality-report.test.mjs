import assert from "node:assert/strict";
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

test("inventory-quality npm script is wired", () => {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  assert.match(
    pkg.scripts["verify:inventory-quality"],
    /verify-rental-inventory-quality\.mjs/,
  );
});
