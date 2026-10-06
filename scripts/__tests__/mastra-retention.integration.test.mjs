/**
 * Behavioural proof for the Mastra retention implementation.
 *
 * Opt-in and disposable-database only:
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
 *   MASTRA_RETENTION_INTEGRATION=1 node --test scripts/__tests__/mastra-retention.integration.test.mjs
 *
 * Refuses a non-loopback database unless MASTRA_RETENTION_ALLOW_REMOTE=1 is set,
 * because the recurrence test deletes rows.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";
import { mastraRetentionSql } from "../lib/mastra-retention.mjs";

const enabled = process.env.MASTRA_RETENTION_INTEGRATION === "1";
const connectionString = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "").trim();

function isLoopback(url) {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

const allowed = enabled && Boolean(connectionString) &&
  (isLoopback(connectionString) || process.env.MASTRA_RETENTION_ALLOW_REMOTE === "1");

test("mastra retention behaves safely", { skip: !allowed ? "opt-in: DATABASE_URL + MASTRA_RETENTION_INTEGRATION=1 on a disposable DB" : false }, async () => {
  const client = new Client({ connectionString });
  const run = "mrt-" + randomUUID().slice(0, 8);
  await client.connect();
  try {
    await client.query(mastraRetentionSql());

    // --- (1) recurring trace retention ------------------------------------
    const oldSpan = run + "-old-span";
    const newSpan = run + "-new-span";
    // The adapter maintains "createdAt" through a BEFORE INSERT trigger, so a stale
    // row cannot be written with the trigger enabled. Disable it only for the seed.
    await disableTriggers(client, "public.mastra_ai_spans");
    try {
      await client.query(
        "insert into public.mastra_ai_spans (\"traceId\", \"spanId\", name, \"spanType\", \"isEvent\", \"startedAt\", \"createdAt\") values ($1, $2, 'x', 'span', false, now() at time zone 'UTC' - interval '90 days', now() at time zone 'UTC' - interval '90 days'), ($3, $4, 'x', 'span', false, now() at time zone 'UTC', now() at time zone 'UTC')",
        [oldSpan, run + "-old", newSpan, run + "-new"],
      );
    } finally {
      await enableTriggers(client, "public.mastra_ai_spans");
    }

    const spansDry = await one(client, "select public.mastra_cleanup_spans(30, true) as result");
    assert.ok(spansDry.deletedSpans >= 1, "dry run reports the stale span");
    assert.equal(await spanExists(client, oldSpan), true, "dry run deletes nothing");

    await one(client, "select public.mastra_cleanup_spans(30, false) as result");
    assert.equal(await spanExists(client, oldSpan), false, "stale span is expired");
    assert.equal(await spanExists(client, newSpan), true, "fresh span is retained");

    // --- (2) one-time legacy anonymous sweep ------------------------------
    const anonThread = run + "-anon-thread";
    const userThread = run + "-user-thread";
    await client.query("alter table public.mastra_threads disable trigger mastra_threads_reject_anonymous");
    await insertThread(client, anonThread, "anonymous");
    await insertThread(client, userThread, "11111111-1111-4111-8111-111111111111");
    await insertMessage(client, run + "-anon-m1", anonThread);
    await insertMessage(client, run + "-anon-m2", anonThread);
    await insertMessage(client, run + "-user-m1", userThread);
    await client.query("alter table public.mastra_threads enable trigger mastra_threads_reject_anonymous");

    const refs = await one(client, "select public.mastra_anonymous_references() as result");
    assert.ok(refs.threads >= 1, "references report the legacy thread");
    assert.ok(refs.messages >= 2, "references report the legacy messages");

    const anonDry = await one(client, "select public.mastra_cleanup_anonymous_threads(true) as result");
    assert.ok(anonDry.deletedThreads >= 1, "dry run reports the legacy thread");
    assert.equal(await threadExists(client, anonThread), true, "dry run deletes no thread");

    await one(client, "select public.mastra_cleanup_anonymous_threads(false) as result");
    assert.equal(await threadExists(client, anonThread), false, "legacy anonymous thread is removed");
    assert.equal(await threadExists(client, userThread), true, "real user thread survives");
    assert.equal(await messagesFor(client, userThread), 1, "real user message survives");
    assert.equal(await one(client, "select public.mastra_orphan_message_count() as n"), 0, "no orphan messages");
    assert.equal(await one(client, "select public.mastra_anonymous_thread_count() as n"), 0, "anonymous count is zero");

    // --- (3) regression detection -----------------------------------------
    await assert.rejects(
      () => insertThread(client, run + "-blocked", "anonymous"),
      (error) => error.code === "42501",
      "a new anonymous thread is rejected at write time",
    );

    await client.query("alter table public.mastra_threads disable trigger mastra_threads_reject_anonymous");
    await insertThread(client, run + "-regressed", "anonymous");
    await client.query("alter table public.mastra_threads enable trigger mastra_threads_reject_anonymous");
    await assert.rejects(
      () => one(client, "select public.mastra_assert_no_anonymous_threads() as result"),
      /anonymous-thread regression/,
      "the assertion fails when an anonymous thread exists",
    );
  } finally {
    await client.query("delete from public.mastra_ai_spans where \"traceId\" like $1", [run + "%"]).catch(() => undefined);
    await client.query("delete from public.mastra_messages where id like $1", [run + "%"]).catch(() => undefined);
    await client.query("alter table public.mastra_threads disable trigger mastra_threads_reject_anonymous").catch(() => undefined);
    await client.query("delete from public.mastra_threads where id like $1", [run + "%"]).catch(() => undefined);
    await client.query("alter table public.mastra_threads enable trigger mastra_threads_reject_anonymous").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
});

async function disableTriggers(client, table) {
  const { rows } = await client.query(
    "select tgname from pg_trigger where tgrelid = $1::regclass and not tgisinternal",
    [table],
  );
  for (const row of rows) {
    await client.query("alter table " + table + " disable trigger \"" + row.tgname + "\"");
  }
}

async function enableTriggers(client, table) {
  const { rows } = await client.query(
    "select tgname from pg_trigger where tgrelid = $1::regclass and not tgisinternal",
    [table],
  );
  for (const row of rows) {
    await client.query("alter table " + table + " enable trigger \"" + row.tgname + "\"");
  }
}

async function one(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return rows[0]?.result ?? rows[0]?.n ?? null;
}
async function spanExists(client, traceId) {
  const { rowCount } = await client.query("select 1 from public.mastra_ai_spans where \"traceId\" = $1", [traceId]);
  return rowCount > 0;
}
async function threadExists(client, id) {
  const { rowCount } = await client.query("select 1 from public.mastra_threads where id = $1", [id]);
  return rowCount > 0;
}
async function messagesFor(client, threadId) {
  const { rows } = await client.query("select count(*)::int as n from public.mastra_messages where thread_id = $1", [threadId]);
  return rows[0].n;
}
async function insertThread(client, id, resourceId) {
  return client.query(
    "insert into public.mastra_threads (id, \"resourceId\", title, \"createdAt\", \"updatedAt\") values ($1, $2, 't', now() at time zone 'UTC', now() at time zone 'UTC')",
    [id, resourceId],
  );
}
async function insertMessage(client, id, threadId) {
  return client.query(
    "insert into public.mastra_messages (id, thread_id, content, role, type, \"createdAt\") values ($1, $2, 'c', 'user', 'text', now() at time zone 'UTC')",
    [id, threadId],
  );
}
