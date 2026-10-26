#!/usr/bin/env node
import fs from "node:fs";
import { Client } from "pg";

/**
 * Remove only the explicitly allowlisted QA fixture prefixes.
 *
 * Dry-run by default:
 *   node scripts/cleanup-qa-fixtures.mjs
 * Apply, with a JSON backup written before deletion:
 *   node scripts/cleanup-qa-fixtures.mjs --apply
 *
 * Never broaden these prefixes without a reviewed code change.
 */
const APPLY = process.argv.includes("--apply");
const PREFIXES = ["[QA]%", "QA HITL%", "QA SAN-896%", "[QA DELETE]%", "[QA DEMO]%"];
const CHILD_TABLES = [
  "event_check_ins",
  "event_attendees",
  "event_orders",
  "event_tickets",
  "event_promo_codes",
  "event_embeddings",
  "event_grounding",
  "event_media_assets",
  "event_signals",
  "event_sponsors",
  "event_stakeholders",
  "event_vendors",
  "event_wait_list",
];

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("✗ SUPABASE_DB_URL is not set");
  process.exit(1);
}

const client = new Client({ connectionString });
await client.connect();

try {
  if (!APPLY) {
    const rows = await client.query(
      `select e.id, e.name, e.status,
              (select count(*)::int from public.event_orders o where o.event_id=e.id) as orders
         from public.events e
        where e.name like any($1::text[])
        order by e.created_at`,
      [PREFIXES],
    );
    console.log(`QA cleanup dry-run: ${rows.rows.length} event(s)`);
    for (const row of rows.rows) {
      console.log(`- ${row.name} (${row.status}, ${row.orders} order(s))`);
    }
    console.log("No rows changed. Re-run with --apply to delete.");
    process.exit(0);
  }

  await client.query("begin");
  const selected = await client.query(
    `select e.*, u.email as organizer_email
       from public.events e
       left join auth.users u on u.id=e.organizer_id
      where e.name like any($1::text[])
      order by e.created_at
      for update of e`,
    [PREFIXES],
  );
  const ids = selected.rows.map((row) => row.id);
  if (ids.length === 0) {
    await client.query("commit");
    console.log("QA cleanup: 0 events; nothing to do.");
    process.exit(0);
  }

  const children = {};
  for (const table of CHILD_TABLES) {
    const result = await client.query(
      `select * from public.${table} where event_id = any($1::uuid[])`,
      [ids],
    );
    children[table] = result.rows;
  }

  fs.mkdirSync("tmp/qa", { recursive: true });
  const backup = "tmp/qa/qa-cleanup-backup.json";
  fs.writeFileSync(
    backup,
    JSON.stringify({ createdAt: new Date().toISOString(), events: selected.rows, children }, null, 2),
  );

  const deleted = {};
  for (const table of CHILD_TABLES) {
    const result = await client.query(
      `delete from public.${table} where event_id = any($1::uuid[])`,
      [ids],
    );
    deleted[table] = result.rowCount;
  }
  const events = await client.query(
    "delete from public.events where id = any($1::uuid[])",
    [ids],
  );
  deleted.events = events.rowCount;

  const left = await client.query(
    "select count(*)::int n from public.events where name like any($1::text[])",
    [PREFIXES],
  );
  if (left.rows[0].n !== 0) throw new Error("QA cleanup verification failed");
  await client.query("commit");
  console.log(JSON.stringify({ backup, deleted }, null, 2));
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`✗ QA cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
