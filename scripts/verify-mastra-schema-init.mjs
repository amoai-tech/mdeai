#!/usr/bin/env node
/**
 * SAN-1321 — prove a REAL database provisions the committed Mastra contract.
 *
 * Why this exists
 * ---------------
 * `check-mastra-schema-contract.mjs` compares the *installed package versions*
 * against the contract. That is necessary but not sufficient: a correctly paired
 * adapter could still create the wrong table set. This script closes that gap by
 * running the real initializer against a real database and diffing what it
 * actually created against `scripts/mastra-schema-contract.json`.
 *
 * It is opt-in (not part of `floor`, which has no database):
 *
 *   DATABASE_URL=postgresql://… npm run check:mastra:schema:init
 *
 * Run it **after** `npm run mastra:init` against the same database. This script
 * asserts the provisioned state; it deliberately does not install the SAN-547
 * thread-ownership guard, because installing it here would hide an initializer
 * that stopped applying it.
 *
 * Use a scratch/local database. The initializer is idempotent, but this is a
 * provisioning check, not something to point at production.
 *
 * Exit codes: 0 = every contract table present; 1 = missing tables, an
 * unreachable database, or no DATABASE_URL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { PostgresStore } from "@mastra/pg";
import {
  THREAD_OWNERSHIP_GUARD_NAME,
  THREAD_OWNERSHIP_REJECTION_CODE,
} from "./lib/mastra-thread-ownership-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const contractArg = argValue("--contract");
const contractPath = path.resolve(ROOT, contractArg ?? "scripts/mastra-schema-contract.json");
if (contractPath !== ROOT && !contractPath.startsWith(ROOT + path.sep)) {
  console.error("mastra-schema-init-check: contract path must stay inside project root");
  process.exit(1);
}
const connectionString = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "").trim();

if (!connectionString) {
  console.error(
    "mastra-schema-init-check: DATABASE_URL is required.\n" +
      "  local:  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm run check:mastra:schema:init",
  );
  process.exit(1);
}

let expected;
try {
  expected = JSON.parse(fs.readFileSync(contractPath, "utf8")).expectedTables;
} catch (error) {
  console.error(`mastra-schema-init-check: cannot read ${contractPath}: ${error.message}`);
  process.exit(1);
}
if (!Array.isArray(expected) || expected.length === 0) {
  console.error("mastra-schema-init-check: contract lists no expected tables");
  process.exit(1);
}

/** Host/database only — never echo credentials. */
function safeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

const store = new PostgresStore({ id: "mastra-schema-init-check", connectionString });
const client = new Client({ connectionString });

/**
 * SAN-547 — prove thread ownership is immutable, under REAL concurrency.
 *
 * Two independent connections race the same fresh thread id using the *storage
 * layer's own* upsert shape (`ON CONFLICT (id) DO UPDATE SET "resourceId" = …`,
 * copied from `@mastra/pg` `saveThread`). Exactly one may own the thread; the
 * other must be refused with 42501.
 *
 * This is the regression gate for the cross-user takeover: two users naming the
 * same not-yet-existing thread were both authorized as "new", and the second
 * writer's upsert silently reassigned the owner. Sequential assertions cannot see
 * that — only concurrent writers can.
 */
async function assertThreadOwnershipImmutable(primary) {
  const { rows: guard } = await primary.query(
    `SELECT p.proname
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_proc p ON p.oid = t.tgfoid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'mastra_threads'
        AND t.tgname = $1
        AND NOT t.tgisinternal`,
    [THREAD_OWNERSHIP_GUARD_NAME],
  );
  if (guard.length === 0) {
    console.error(
      `  ownership guard      : MISSING — ${THREAD_OWNERSHIP_GUARD_NAME} is not on public.mastra_threads.\n` +
        "  SAN-547: thread ownership is not immutable without it, so this check cannot pass.\n" +
        "  Run `npm run mastra:init` against this database first — it installs the guard.",
    );
    process.exitCode = 1;
    return;
  }

  const threadId = `san547-ownership-race-${randomUUID()}`;
  const ownerA = "san547-race-user-a";
  const ownerB = "san547-race-user-b";

  // Deliberately the exact statement the vendor runs, because the DO UPDATE is
  // the reassignment vector being guarded.
  const upsert = `
    INSERT INTO public.mastra_threads
      (id, "resourceId", title, metadata, "createdAt", "createdAtZ", "updatedAt", "updatedAtZ")
    VALUES ($1, $2, $3, NULL, now() AT TIME ZONE 'UTC', now(), now() AT TIME ZONE 'UTC', now())
    ON CONFLICT (id) DO UPDATE SET "resourceId" = EXCLUDED."resourceId"`;

  const rival = new Client({ connectionString });
  await rival.connect();
  try {
    const [first, second] = await Promise.allSettled([
      primary.query(upsert, [threadId, ownerA, "race A"]),
      rival.query(upsert, [threadId, ownerB, "race B"]),
    ]);

    const winners = [first, second].filter((r) => r.status === "fulfilled");
    const losers = [first, second].filter((r) => r.status === "rejected");
    const winnerOwner = first.status === "fulfilled" ? ownerA : ownerB;
    const loserCode = losers[0]?.reason?.code ?? "none";

    const { rows: stored } = await primary.query(
      'SELECT "resourceId" FROM public.mastra_threads WHERE id = $1',
      [threadId],
    );
    const storedOwner = stored[0]?.resourceId ?? null;

    console.log(`  ownership race       : ${winners.length} owner(s), ${losers.length} refused (${loserCode})`);
    console.log(`  stored owner         : ${storedOwner}`);

    const failures = [];
    if (winners.length !== 1) {
      failures.push(`expected exactly 1 owner, got ${winners.length} — a thread changed hands`);
    }
    if (losers.length !== 1) failures.push(`expected exactly 1 refusal, got ${losers.length}`);
    if (loserCode !== THREAD_OWNERSHIP_REJECTION_CODE) {
      failures.push(`expected refusal code ${THREAD_OWNERSHIP_REJECTION_CODE}, got ${loserCode}`);
    }
    if (storedOwner !== winnerOwner) {
      failures.push(`stored owner ${storedOwner} does not match the winner ${winnerOwner}`);
    }

    if (failures.length) {
      console.error("\nmastra-schema-init-check: FAIL — thread ownership is not immutable.");
      for (const failure of failures) console.error(`  * ${failure}`);
      process.exitCode = 1;
    }
  } finally {
    await primary
      .query("DELETE FROM public.mastra_threads WHERE id = $1", [threadId])
      .catch(() => undefined);
    await rival.end().catch(() => undefined);
  }
}

try {
  console.log(`mastra-schema-init-check: provisioning ${safeTarget(connectionString)}`);
  await store.init();

  await client.connect();
  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'mastra\\_%'",
  );
  const actual = new Set(rows.map((r) => r.table_name));

  const missing = expected.filter((t) => !actual.has(t));
  const extra = [...actual].filter((t) => !expected.includes(t));

  console.log(`  contract expects     : ${expected.length}`);
  console.log(`  database provisioned : ${actual.size}`);
  console.log(`  missing vs contract  : ${missing.length}${missing.length ? ` — ${missing.join(", ")}` : ""}`);
  console.log(`  extra vs contract    : ${extra.length}${extra.length ? ` — ${extra.join(", ")}` : ""}`);

  if (missing.length) {
    console.error(
      `\nmastra-schema-init-check: FAIL — the initializer did not create ${missing.length} contract table(s).`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nmastra-schema-init-check: OK — every contract table was provisioned.");
  }

  // SAN-547 — asserted, never applied. `mastra:init` owns installing the guard, so
  // this script must FAIL when the guard is absent rather than install it itself:
  // installing it here would mask an initializer that silently stopped applying it.
  await assertThreadOwnershipImmutable(client);
} catch (error) {
  console.error(
    `mastra-schema-init-check: FAILED — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  // Both of these hold open handles: the pg Client and the PostgresStore's own
  // pool. Leaving either unclosed keeps the event loop alive, so the script would
  // print its verdict and then hang instead of exiting — unusable in CI.
  await client.end().catch(() => undefined);
  await store.close().catch(() => undefined);
}
