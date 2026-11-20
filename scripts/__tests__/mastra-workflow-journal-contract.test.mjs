import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { exportSchemas } from "@mastra/pg";

const contract = JSON.parse(
  readFileSync(new URL("../mastra-schema-contract.json", import.meta.url), "utf8"),
);
const migration = readFileSync(
  new URL("../../supabase/migrations/20261120180824_mastra_184_workflow_journal.sql", import.meta.url),
  "utf8",
);
const vendor = exportSchemas("public");
const journalTables = ["mastra_workflow_runs", "mastra_workflow_run_entries"];

function tableDefinition(sql, name) {
  const statement = sql.split(";").find((part) =>
    /create table if not exists/i.test(part) && part.includes('"' + name + '"'),
  );
  assert.ok(statement, "missing " + name + " table declaration");
  return statement.slice(statement.indexOf("(") + 1);
}

/**
 * Types this contract models. A declaration using anything else is a FAILURE, not
 * something to skip: the previous type allowlist silently dropped every column it
 * did not recognise, so an added `uuid` column compared equal to the vendor DDL
 * and the drift went unnoticed.
 */
const KNOWN_COLUMN_TYPES = new Set([
  "timestamptz",
  "timestamp",
  "text",
  "integer",
  "boolean",
  "jsonb",
]);

function columns(definition, label = "ddl") {
  const parsed = [];
  for (const line of definition.split("\n")) {
    // Column declarations start with a quoted identifier; PRIMARY KEY (...) and
    // CONSTRAINT ... lines do not, so they are skipped rather than mis-parsed.
    const declaration = line.match(/^\s*"([^"]+)"\s+(\S+)/);
    if (!declaration) continue;
    const [, name, rawType] = declaration;
    // The vendor formatter sometimes omits the space before a column's trailing
    // comma, so strip the separator before classifying the type.
    const type = rawType.replace(/,$/, "").toLowerCase();
    assert.ok(
      KNOWN_COLUMN_TYPES.has(type),
      `${label}: column "${name}" uses unrecognised type "${type}" — extend ` +
        "KNOWN_COLUMN_TYPES deliberately instead of letting it pass",
    );
    parsed.push({
      name,
      type,
      nullable: !/\bnot null\b/i.test(line),
      defaultNow: /\bdefault\s+now\(\)/i.test(line),
    });
  }
  assert.ok(parsed.length > 0, label + ": no column declarations parsed");
  return parsed;
}

function primaryKey(definition) {
  const key = definition.match(/primary key\s*\(([^)]+)\)/i);
  assert.ok(key, "composite primary key is required");
  return key[1].replace(/["\s]/g, "").toLowerCase();
}

function columnLineIndex(definition, columnName) {
  const lines = definition.split("\n");
  // Match with string primitives instead of building a RegExp from a variable:
  // the column name is an internal constant, but a dynamic RegExp is both flagged
  // by static analysis and harder to read than a prefix check.
  const quoted = '"' + columnName + '"';
  const index = lines.findIndex((line) => {
    const trimmed = line.trimStart();
    return trimmed.startsWith(quoted) && /\s/.test(trimmed.charAt(quoted.length));
  });
  assert.ok(index >= 0, 'mutation fixture cannot find column "' + columnName + '" in vendor DDL');
  return { lines, index };
}

/**
 * Replace only the type token that follows the quoted name. Anchoring on the
 * identifier instead of exact spacing/casing means a vendor formatter change
 * cannot make the regex miss — and the change is asserted, so a mutation that did
 * nothing can never masquerade as a passing negative test.
 */
function withColumnType(definition, columnName, replacementType) {
  const { lines, index } = columnLineIndex(definition, columnName);
  const before = lines[index];
  lines[index] = before.replace(/^(\s*"[^"]+"\s+)\S+/, (_, prefix) => prefix + replacementType);
  assert.notEqual(lines[index], before, 'type mutation for "' + columnName + '" did not apply');
  return lines.join("\n");
}

function withoutColumnDefault(definition, columnName) {
  const { lines, index } = columnLineIndex(definition, columnName);
  const before = lines[index];
  lines[index] = before.replace(/\s+default\s+now\(\)/i, "");
  assert.notEqual(lines[index], before, 'default mutation for "' + columnName + '" did not apply');
  return lines.join("\n");
}

/** Strip `--` line comments so a leading comment cannot glue onto a statement. */
function withoutComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function normalizeStatement(statement) {
  // SQL keywords and unquoted identifiers are case-insensitive, but quoted
  // identifiers and JSON string keys are not. Keep their original spelling.
  return (statement.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|[^'"]+/g) ?? [])
    .map((part) => {
      if (part.startsWith("'")) return part;
      if (part.startsWith('"')) {
        const identifier = part.slice(1, -1).replace(/""/g, '"');
        return /^[a-z_][a-z0-9_]*$/.test(identifier) ? identifier : part;
      }
      return part.replace(/\s+/g, " ").toLowerCase();
    })
    .join("")
    .trim();
}

/**
 * Full CREATE INDEX definitions keyed by name. Comparing the DEFINITION — indexed
 * columns, their order, and the partial predicate — is what catches an index that
 * keeps its expected name while indexing the wrong thing; a name-only check does
 * not.
 */
function journalIndexDefinitions(sql) {
  const definitions = new Map();
  for (const statement of withoutComments(sql).split(";")) {
    const match = statement.match(
      /create index if not exists\s+"?(mastra_workflow_(?:runs|run_entries)_[a-z_]+)"?/i,
    );
    if (match) definitions.set(match[1], normalizeStatement(statement));
  }
  return definitions;
}

test("Mastra 1.84 journal migration matches the exact installed vendor DDL", () => {
  for (const name of journalTables) {
    const upstream = tableDefinition(vendor, name);
    const local = tableDefinition(migration, name);
    assert.deepEqual(columns(local, name + " (migration)"), columns(upstream, name + " (vendor)"),
      name + ": column drift from @mastra/pg");
    assert.equal(primaryKey(local), primaryKey(upstream), name + ": key drift from @mastra/pg");
    assert.ok(contract.expectedTables.includes(name), name + " must be a required table");
  }
  const vendorIndexes = journalIndexDefinitions(vendor);
  const migrationIndexes = journalIndexDefinitions(migration);
  assert.deepEqual([...migrationIndexes.keys()].sort(), [...vendorIndexes.keys()].sort(),
    "journal index names must match @mastra/pg");
  assert.ok(vendorIndexes.size > 0, "vendor DDL must declare journal indexes");
  for (const [name, definition] of vendorIndexes) {
    assert.equal(migrationIndexes.get(name), definition,
      name + ": index columns, order and predicate must match @mastra/pg");
  }

  // Any future vendor table must be explicitly classified, not silently accepted.
  const classified = new Set([...contract.expectedTables, ...contract.adapterInitExtraTables]);
  const vendorTables = [...vendor.matchAll(/CREATE TABLE IF NOT EXISTS "public"\."(mastra_[^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(vendorTables.filter((name) => !classified.has(name)), []);
  assert.deepEqual(contract.expectedTables.filter((name) => !vendorTables.includes(name)), []);
});

test("index drift detection preserves case-sensitive JSON keys and quoted identifiers", () => {
  const original = journalIndexDefinitions(migration);

  // PostgreSQL JSON object keys are case-sensitive. The earlier whole-SQL
  // .toLowerCase() normalized these two different expression indexes as equal.
  const wrongJsonKey = migration.replace("payload ->> 'workflowName'", "payload ->> 'workflowname'");
  assert.notEqual(wrongJsonKey, migration, "JSON-key mutation must apply");
  assert.notDeepEqual(journalIndexDefinitions(wrongJsonKey), original,
    "index drift must detect a changed JSON key");

  // Quoted mixed-case column names are also case-sensitive in PostgreSQL.
  const wrongColumn = migration.replace('("threadId")', '("threadid")');
  assert.notEqual(wrongColumn, migration, "quoted-identifier mutation must apply");
  assert.notDeepEqual(journalIndexDefinitions(wrongColumn), original,
    "index drift must detect a changed quoted column");
});

test("timezone-aware journal columns and defaults cannot silently drift", () => {
  const expected = {
    type: "timestamptz",
    nullable: true,
    defaultNow: true,
  };
  for (const ddl of [vendor, migration]) {
    const runs = columns(tableDefinition(ddl, "mastra_workflow_runs"), "mastra_workflow_runs");
    for (const name of ["createdAtZ", "updatedAtZ"]) {
      const found = runs.find((c) => c.name === name);
      assert.deepEqual(found, { name, ...expected }, name + " must preserve timezone/default");
    }
  }
  const original = tableDefinition(vendor, "mastra_workflow_runs");
  const wrongType = withColumnType(original, "createdAtZ", "TIMESTAMP");
  const wrongDefault = withoutColumnDefault(original, "updatedAtZ");
  assert.notDeepEqual(columns(wrongType, "mutated-type"), columns(original, "vendor"),
    "timestamp vs timestamptz must be detected");
  assert.notDeepEqual(columns(wrongDefault, "mutated-default"), columns(original, "vendor"),
    "a removed default must be detected");

  // Regression for the allowlist hole: a column of an unmodelled type used to be
  // dropped from both sides, so it compared equal. It must now fail loudly.
  assert.throws(
    () => columns('  "workflow_name" text not null,\n  "extraTag" uuid,\n', "injected"),
    /unrecognised type "uuid"/i,
    "an unknown column type must fail the contract instead of being skipped",
  );
});

test("new journal tables keep FORCE RLS and deny untrusted client roles", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all on public\.%I from public/i);
  assert.match(migration, /revoke all on public\.%I from anon/i);
  assert.match(migration, /revoke all on public\.%I from authenticated/i);
  assert.match(migration, /service_role_manage/);
});
