#!/usr/bin/env node
/**
 * SAN-1284 / SAN-1291 — defence-in-depth gate for function EXECUTE exposure.
 *
 * Batch 0A's default-privilege migration stops NEW functions from inheriting end-user
 * EXECUTE. This script is the second line of defence: it fails when a function appears
 * in `public` with anon / authenticated / PUBLIC EXECUTE that is not accounted for in
 * the checked-in baseline.
 *
 * It is deliberately a DRIFT gate, not a "zero exposure" gate. The fresh replay is
 * currently more permissive than production for 21 functions (see SAN-1284 for the
 * measured list, money path first). Those are recorded in the baseline; the gate's job
 * is to make sure that set only ever SHRINKS, and that a new function can never quietly
 * arrive already exposed. Batch 0B removes entries from the baseline as it lands
 * per-function revokes.
 *
 * Usage:
 *   supabase db reset && npm run check:function-acl
 *   npm run check:function-acl -- --update    # regenerate the baseline (review the diff!)
 *
 * Local gate only: resolves the local stack via scripts/lib/local-db-url.mjs and never
 * points at production.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resolveLocalDbUrl } from "./lib/local-db-url.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(ROOT, "scripts", "function-acl-baseline.json");
const UPDATE = process.argv.includes("--update");

/**
 * App-owned functions in `public`, with effective Execute per role.
 *
 * Deliberately NOT limited to SECURITY DEFINER: PostgREST exposes any executable
 * function in an exposed schema as an RPC, so a plain SECURITY INVOKER function with
 * PUBLIC EXECUTE is just as reachable. An earlier revision filtered on prosecdef and
 * silently missed exactly that case.
 *
 * Extension-owned functions are excluded mechanically via pg_depend/pg_extension, so
 * PostGIS / pgvector / pg_trgm never appear here.
 */
const QUERY = `
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
         exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec,
         exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  join pg_roles r on r.oid = a.grantee
                  where r.rolname = 'anon' and a.privilege_type = 'EXECUTE') as anon_exec,
         exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  join pg_roles r on r.oid = a.grantee
                  where r.rolname = 'authenticated' and a.privilege_type = 'EXECUTE') as auth_exec
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  order by 1
`;

function exposure(rows) {
  const out = {};
  for (const r of rows) {
    if (r.public_exec || r.anon_exec || r.auth_exec) {
      out[r.signature] = {
        public: r.public_exec,
        anon: r.anon_exec,
        authenticated: r.auth_exec,
      };
    }
  }
  return out;
}

let dbUrl;
try {
  dbUrl = resolveLocalDbUrl();
} catch (err) {
  console.log(
    `SKIP function-acl gate (no local DB URL): ${err instanceof Error ? err.message : err}`,
  );
  process.exit(0);
}

const client = new pg.Client({ connectionString: dbUrl });
try {
  await client.connect();
} catch (err) {
  console.log(
    `SKIP function-acl gate (local DB unreachable): ${err instanceof Error ? err.message : err}`,
  );
  process.exit(0);
}

let rows;
try {
  ({ rows } = await client.query(QUERY));
} finally {
  await client.end();
}

const current = exposure(rows);

if (UPDATE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`function-acl baseline updated: ${Object.keys(current).length} exposed functions`);
  console.log("Review the diff — every entry is a function end users can execute.");
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch (err) {
  console.error(
    `FAIL function-acl gate: cannot read ${BASELINE_PATH} (${err instanceof Error ? err.message : err})\n` +
      "  generate it once with: npm run check:function-acl -- --update",
  );
  process.exit(1);
}

const added = Object.keys(current).filter((k) => !(k in baseline));
const removed = Object.keys(baseline).filter((k) => !(k in current));
const widened = Object.keys(current).filter(
  (k) =>
    k in baseline &&
    Object.entries(current[k]).some(([role, val]) => val && !baseline[k][role]),
);

// Report the UNTRUSTED surface explicitly. Entry count alone is a weak signal: nearly every
// RPC legitimately keeps `authenticated`, so the baseline length barely moves even when real
// exposure is removed. The PUBLIC/anon counts are what Batch 0A/0B actually drive down.
const pubCount = Object.values(current).filter((v) => v.public).length;
const anonCount = Object.values(current).filter((v) => v.anon).length;
console.log(
  `function-acl gate: ${Object.keys(current).length} reachable, ` +
    `${pubCount} PUBLIC-executable, ${anonCount} anon-executable ` +
    `(${Object.keys(baseline).length} baselined)`,
);

let failed = false;

if (added.length) {
  failed = true;
  console.error(`\nFAIL — ${added.length} function(s) newly executable by an end-user role:`);
  for (const k of added) {
    console.error(`  + ${k}  ${JSON.stringify(current[k])}`);
  }
  console.error(
    "\nEither revoke EXECUTE from PUBLIC/anon/authenticated in the migration that added it,\n" +
      "or — if end-user execution is genuinely intended — record it with:\n" +
      "  npm run check:function-acl -- --update",
  );
}

if (widened.length) {
  failed = true;
  console.error(`\nFAIL — ${widened.length} function(s) gained a new end-user role:`);
  for (const k of widened) {
    console.error(`  ~ ${k}  baseline=${JSON.stringify(baseline[k])} now=${JSON.stringify(current[k])}`);
  }
}

if (removed.length) {
  console.log(`\nNote: ${removed.length} baselined function(s) are no longer exposed or no longer exist.`);
  for (const k of removed) console.log(`  - ${k}`);
  console.log("  Run `npm run check:function-acl -- --update` to shrink the baseline and lock the win in.");
}

process.exit(failed ? 1 : 0);
