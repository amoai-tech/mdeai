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
/**
 * Disposable identities created by the Playwright isolation suite.
 *
 * They live on their own domain and can be left behind when a test process is
 * KILLED: no `finally`, no `afterAll`, nothing in that process runs again. This
 * scheduled job is the independent recovery path.
 *
 * The DOMAIN is the trust boundary, exactly as `deleteThrowawayIdentity` treats it
 * (`endsWith("@qa-isolation.mdeai.co")`): `createThrowawayIdentity` builds
 * `${label}-${uuid}@qa-isolation.mdeai.co` and most labels do NOT start with `qa-`
 * (`san1204-owner`, `pr552-owner`, `prod-release-health`, …), so matching on a label
 * prefix would leave those accounts invisible forever.
 *
 * Only identities older than the margin are eligible, so a run that is still
 * alive can never lose its account (the longest journey is well under an hour).
 */
const ISOLATION_EMAIL_PATTERN = "%@qa-isolation.mdeai.co";
const ISOLATION_MIN_AGE = "2 hours";
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
          and exists (
            select 1 from auth.users u
             where u.id = e.organizer_id
               and u.email like 'qa-%@mdeai.co'
          )
        order by e.created_at`,
      [PREFIXES],
    );
    console.log(`QA cleanup dry-run: ${rows.rows.length} event(s)`);
    for (const row of rows.rows) {
      console.log(`- ${row.name} (${row.status}, ${row.orders} order(s))`);
    }
    const orphanIdentities = await client.query(
      `select u.id, u.email, u.created_at
         from auth.users u
        where u.email like $1
          and u.created_at < now() - $2::interval
        order by u.created_at`,
      [ISOLATION_EMAIL_PATTERN, ISOLATION_MIN_AGE],
    );
    console.log(
      `QA cleanup dry-run: ${orphanIdentities.rows.length} orphaned isolation identity(ies)`,
    );
    for (const row of orphanIdentities.rows) {
      console.log(`- ${row.email} (created ${row.created_at.toISOString()})`);
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
        and exists (
          select 1 from auth.users u
           where u.id = e.organizer_id
             and u.email like 'qa-%@mdeai.co'
        )
      order by e.created_at
      for update of e`,
    [PREFIXES],
  );
  const ids = selected.rows.map((row) => row.id);
  // Orphaned isolation identities are selected up front: an event-less run must still
  // be able to recover an identity left behind by a killed test process.
  const orphanIdentities = await client.query(
    `select u.id, u.email
       from auth.users u
      where u.email like $1
        and u.created_at < now() - $2::interval
      order by u.created_at
      for update`,
    [ISOLATION_EMAIL_PATTERN, ISOLATION_MIN_AGE],
  );
  if (ids.length === 0 && orphanIdentities.rows.length === 0) {
    await client.query("commit");
    console.log("QA cleanup: 0 events and 0 orphaned identities; nothing to do.");
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
  if (fs.existsSync(backup)) {
    throw new Error(
      `refusing to overwrite ${backup}; move the previous backup before applying`,
    );
  }
  // Backup SAFETY: record WHICH identity is removed and how much, never what it says.
  //
  // This file is uploaded as a routine CI artifact by
  // `.github/workflows/qa-fixture-cleanup.yml`. Dumping `profiles` or `mastra_messages`
  // rows here would retain private chat contents and account details in artifact
  // storage, so only identifiers and ROW COUNTS are written. The rollback value is
  // therefore bounded: the file proves what was removed, it does not restore the text.
  const identityIds = orphanIdentities.rows.map((row) => row.id);
  const identityImpact = { profiles: 0, threads: 0, messages: 0 };
  if (identityIds.length > 0) {
    const counts = await client.query(
      `select
         (select count(*)::int from public.profiles where id = any($1::uuid[])) as profiles,
         (select count(*)::int from public.mastra_threads where "resourceId" = any($2::text[])) as threads,
         (select count(*)::int from public.mastra_messages where thread_id in (
            select id from public.mastra_threads where "resourceId" = any($2::text[]))) as messages`,
      [identityIds, identityIds.map(String)],
    );
    Object.assign(identityImpact, counts.rows[0]);
  }
  fs.writeFileSync(
    backup,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        events: selected.rows,
        children,
        // Identifiers only: no profile fields, no message bodies.
        isolationIdentities: orphanIdentities.rows.map((row) => ({ id: row.id, email: row.email })),
        isolationIdentityImpact: identityImpact,
      },
      null,
      2,
    ),
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

  // Orphaned isolation identities, each in its OWN savepoint.
  //
  // Non-cascading links exist (`events.organizer_id → profiles`,
  // `partners.profile_id … on delete restrict`, `event_stakeholders.user_id`,
  // `event_promo_codes.created_by → auth.users`). One identity that owns such a row
  // would otherwise abort the whole transaction — including the event cleanup that
  // worked — and fail the same way every day. Now that identity is skipped and
  // reported, and the rest still proceed.
  const skippedIdentities = [];
  const identityCounts = { messages: 0, threads: 0, profiles: 0, users: 0 };
  for (const [index, identity] of orphanIdentities.rows.entries()) {
    const savepoint = `qa_identity_${index}`;
    await client.query(`savepoint ${savepoint}`);
    try {
      const messages = await client.query(
        `delete from public.mastra_messages where thread_id in (
           select id from public.mastra_threads where "resourceId" = $1)`,
        [String(identity.id)],
      );
      const threads = await client.query(
        `delete from public.mastra_threads where "resourceId" = $1`,
        [String(identity.id)],
      );
      // A disposable identity can own a `partners` row (`partners_profile_id_fkey`,
      // ON DELETE RESTRICT), and that reference deliberately STOPS the delete here.
      //
      // Deleting the partner is not safe: `restaurants.partner_id`, `leads.partner_id`
      // and `bookings.partner_id` are ON DELETE SET NULL, so a real restaurant assigned
      // to a QA partner would silently lose its assignment, and `partner_services`,
      // `partner_locations` and `partner_assets` cascade. The savepoint turns the
      // restriction into a reported skip instead of a destructive guess.
      const profiles = await client.query(
        `delete from public.profiles where id = $1::uuid`,
        [identity.id],
      );
      const users = await client.query(
        `delete from auth.users where id = $1::uuid`,
        [identity.id],
      );
      identityCounts.messages += messages.rowCount ?? 0;
      identityCounts.threads += threads.rowCount ?? 0;
      identityCounts.profiles += profiles.rowCount ?? 0;
      identityCounts.users += users.rowCount ?? 0;
      await client.query(`release savepoint ${savepoint}`);
    } catch (error) {
      await client.query(`rollback to savepoint ${savepoint}`);
      skippedIdentities.push({
        id: identity.id,
        email: identity.email,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  deleted.isolationIdentities = identityCounts.users;
  deleted.isolationIdentityRows = identityCounts;
  deleted.isolationIdentitiesSkipped = skippedIdentities.length;
  for (const skipped of skippedIdentities) {
    // Visible in the Actions log without failing the whole job.
    console.log(`::warning::QA identity ${skipped.email} still has blocking references: ${skipped.reason}`);
  }

  const left = await client.query(
    `select count(*)::int n
       from public.events e
      where e.name like any($1::text[])
        and exists (
          select 1 from auth.users u
           where u.id = e.organizer_id
             and u.email like 'qa-%@mdeai.co'
        )`,
    [PREFIXES],
  );
  if (left.rows[0].n !== 0) throw new Error("QA cleanup verification failed");

  // An unreadable or non-empty state must fail the job; it is never "zero".
  const leftIdentities = await client.query(
    `select u.email from auth.users u
      where u.email like $1 and u.created_at < now() - $2::interval`,
    [ISOLATION_EMAIL_PATTERN, ISOLATION_MIN_AGE],
  );
  // A skipped identity is EXPECTED to remain: it is reported, not hidden. Anything
  // else that survived is a real failure.
  const skippedEmails = new Set(skippedIdentities.map((entry) => entry.email));
  const unexpected = leftIdentities.rows.filter((row) => !skippedEmails.has(row.email));
  if (unexpected.length > 0) {
    throw new Error(
      `QA identity cleanup verified ${unexpected.length} leftover identity(ies): ${unexpected
        .map((row) => row.email)
        .join(", ")}`,
    );
  }
  // Rows belonging to a SKIPPED identity are expected to remain with their account;
  // counting them would contradict the warning above and fail the job for a state we
  // deliberately kept.
  const skippedIds = skippedIdentities.map((entry) => entry.id);
  const leftRows = await client.query(
    `select
       (select count(*)::int from public.mastra_threads t
         join auth.users u on u.id::text = t."resourceId"
        where u.email like $1 and not (u.id = any($2::uuid[]))) +
       (select count(*)::int from public.profiles p
         join auth.users u on u.id = p.id
        where u.email like $1 and not (u.id = any($2::uuid[]))) as n`,
    [ISOLATION_EMAIL_PATTERN, skippedIds],
  );
  if (leftRows.rows[0].n !== 0) {
    throw new Error(`QA identity cleanup verified ${leftRows.rows[0].n} leftover row(s)`);
  }
  await client.query("commit");
  console.log(JSON.stringify({ backup, deleted }, null, 2));
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`✗ QA cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
