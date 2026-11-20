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

function columns(definition) {
  return [...definition.matchAll(/^\s*"([^"]+)"\s+(text|integer|boolean|jsonb|timestamp|timestamptz)(\s+not null)?(\s+default\s+now\(\))?/gim)]
    .map((match) => ({
      name: match[1],
      type: match[2].toLowerCase(),
      nullable: !match[3],
      defaultNow: Boolean(match[4]),
    }));
}

function primaryKey(definition) {
  const key = definition.match(/primary key\s*\(([^)]+)\)/i);
  assert.ok(key, "composite primary key is required");
  return key[1].replace(/["\s]/g, "").toLowerCase();
}

function journalIndexes(sql) {
  return [...sql.matchAll(/create index if not exists\s+"?(mastra_workflow_(?:runs|run_entries)_[a-z_]+)"?/gi)]
    .map((match) => match[1])
    .sort();
}

test("Mastra 1.84 journal migration matches the exact installed vendor DDL", () => {
  for (const name of journalTables) {
    const upstream = tableDefinition(vendor, name);
    const local = tableDefinition(migration, name);
    assert.deepEqual(columns(local), columns(upstream), name + ": column drift from @mastra/pg");
    assert.equal(primaryKey(local), primaryKey(upstream), name + ": key drift from @mastra/pg");
    assert.ok(contract.expectedTables.includes(name), name + " must be a required table");
  }
  assert.deepEqual(journalIndexes(migration), journalIndexes(vendor));

  // Any future vendor table must be explicitly classified, not silently accepted.
  const classified = new Set([...contract.expectedTables, ...contract.adapterInitExtraTables]);
  const vendorTables = [...vendor.matchAll(/CREATE TABLE IF NOT EXISTS "public"\."(mastra_[^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(vendorTables.filter((name) => !classified.has(name)), []);
  assert.deepEqual(contract.expectedTables.filter((name) => !vendorTables.includes(name)), []);
});

test("new journal tables keep FORCE RLS and deny untrusted client roles", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all on public\.%I from public/i);
  assert.match(migration, /revoke all on public\.%I from anon/i);
  assert.match(migration, /revoke all on public\.%I from authenticated/i);
  assert.match(migration, /service_role_manage/);
});
