/**
 * Behavioural proof that a late Mastra message write cannot orphan a thread.
 *
 * Opt-in and disposable-database only:
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
 *   MASTRA_INTEGRITY_INTEGRATION=1 node --test scripts/__tests__/mastra-integrity.integration.test.mjs
 *
 * Refuses a non-loopback database unless MASTRA_INTEGRITY_ALLOW_REMOTE=1 is set.
 *
 * The race (observed on production 2026-10-02): Mastra persists a turn's messages
 * AFTER the stream ends. If cleanup deletes the thread in that gap, the late write
 * used to land as an invisible orphan message. This test reproduces it (RED), then
 * proves the guard rejects the late write instead (GREEN).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";
import { mastraRetentionSql } from "../lib/mastra-retention.mjs";

const enabled = process.env.MASTRA_INTEGRITY_INTEGRATION === "1";
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
  (isLoopback(connectionString) || process.env.MASTRA_INTEGRITY_ALLOW_REMOTE === "1");

const UUID_USER = "22222222-2222-4222-8222-222222222222";

test("a late message write is rejected instead of orphaning the thread", { skip: !allowed ? "opt-in: DATABASE_URL + MASTRA_INTEGRITY_INTEGRATION=1 on a disposable DB" : false }, async () => {
  const run = "mit-" + randomUUID().slice(0, 8);
  let client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(mastraRetentionSql());

    // --- RED: reproduce the race with the guard removed --------------------
    await client.query("drop trigger if exists mastra_threads_delete_messages on public.mastra_threads");
    await client.query("drop trigger if exists mastra_messages_reject_orphan on public.mastra_messages");

    const raceThread = run + "-race-thread";
    await insertThread(client, raceThread, UUID_USER);
    await insertMessage(client, run + "-early", raceThread);
    // Cleanup deletes the thread while Mastra is still finishing the turn...
    await client.query("delete from public.mastra_threads where id = $1", [raceThread]);
    // ...and the late write lands against the now-missing thread.
    await insertMessage(client, run + "-late", raceThread);
    const redOrphans = await orphanCount(client);
    assert.ok(redOrphans >= 1, "RED: without the guard the late write orphans the message (got " + redOrphans + ")");

    // Restore the committed guards and remove the RED orphans they now prevent.
    await client.query(mastraRetentionSql());
    await client.query("delete from public.mastra_messages where id = any($1::text[])", [[run + "-early", run + "-late"]]);
    assert.equal(await orphanCount(client), 0, "RED orphans removed before the GREEN assertions");

    // --- GREEN: normal authenticated chat still works ----------------------
    const chatThread = run + "-chat-thread";
    await insertThread(client, chatThread, UUID_USER);
    await insertMessage(client, run + "-chat-u1", chatThread, "user");
    await insertMessage(client, run + "-chat-a1", chatThread, "assistant");
    assert.equal(await messagesFor(client, chatThread), 2, "thread then messages persists normally");

    // Late write against a missing thread is refused with 23503.
    await assert.rejects(
      () => insertMessage(client, run + "-late-guarded", "missing-thread-" + randomUUID()),
      (error) => error.code === "23503",
      "a message referencing no thread is rejected",
    );

    // Re-pointing an existing message at a missing thread is refused too.
    await assert.rejects(
      () => client.query("update public.mastra_messages set thread_id = $1 where id = $2", [
        "missing-thread-" + randomUUID(),
        run + "-chat-a1",
      ]),
      (error) => error.code === "23503",
      "an update to a missing thread is rejected",
    );

    // --- the guard takes a row lock: an insert waits for a concurrent delete ---
    const lockThread = run + "-lock-thread";
    await insertThread(client, lockThread, UUID_USER);
    const deleter = new Client({ connectionString });
    await deleter.connect();
    try {
      await deleter.query("begin");
      await deleter.query("delete from public.mastra_threads where id = $1", [lockThread]);
      // The uncommitted delete holds the row lock. The insert's FOR KEY SHARE must
      // wait for it, so a short lock_timeout surfaces as 55P03 rather than success.
      await client.query("set lock_timeout = '400ms'");
      await assert.rejects(
        () => insertMessage(client, run + "-locked", lockThread),
        (error) => error.code === "55P03",
        "an insert waits for a concurrent thread delete",
      );
      await client.query("set lock_timeout = default");
      await deleter.query("commit");
    } finally {
      await deleter.query("rollback").catch(() => undefined);
      await deleter.end().catch(() => undefined);
    }
    await assert.rejects(
      () => insertMessage(client, run + "-after-delete", lockThread),
      (error) => error.code === "23503",
      "after the delete commits the same insert is rejected",
    );

    // --- thread delete removes its messages (backstop) ---------------------
    await client.query("delete from public.mastra_threads where id = $1", [chatThread]);
    assert.equal(await messagesFor(client, chatThread), 0, "deleting the thread removes its messages");
    assert.equal(await orphanCount(client), 0, "no orphan messages after any of the writes");

    // --- existing anonymous-thread guard still fires -----------------------
    await assert.rejects(
      () => insertThread(client, run + "-anon", "anonymous"),
      (error) => error.code === "42501",
      "the anonymous-thread regression guard still rejects 42501",
    );

    // --- restart / persistence: a fresh connection still reads it ----------
    const durableThread = run + "-durable-thread";
    await insertThread(client, durableThread, UUID_USER);
    await insertMessage(client, run + "-durable-m1", durableThread, "user");
    await client.end();
    client = new Client({ connectionString });
    await client.connect();
    assert.equal(await threadExists(client, durableThread), true, "thread survives a reconnect");
    assert.equal(await messagesFor(client, durableThread), 1, "message survives a reconnect");

    assert.equal(await orphanCount(client), 0, "final orphan count is zero");
  } finally {
    await client.query("delete from public.mastra_messages where id like $1", [run + "%"]).catch(() => undefined);
    await client.query("delete from public.mastra_threads where id like $1", [run + "%"]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
});

async function orphanCount(client) {
  const { rows } = await client.query("select public.mastra_orphan_message_count() as n");
  return rows[0].n;
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
async function insertMessage(client, id, threadId, role = "user") {
  return client.query(
    "insert into public.mastra_messages (id, thread_id, content, role, type, \"createdAt\") values ($1, $2, 'c', $3, 'text', now() at time zone 'UTC')",
    [id, threadId, role],
  );
}
