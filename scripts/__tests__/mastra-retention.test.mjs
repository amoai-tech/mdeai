/**
 * Static safety contract for the Mastra retention implementation.
 *
 * The cleanup targets vendor-owned tables that do not exist in a fresh db reset,
 * so these assertions lock the properties that must never regress:
 *   - recurring retention is traces only;
 *   - nothing is scheduled from SQL, so the anonymous sweep cannot run nightly;
 *   - anonymous threads are rejected at write time, not cleaned up silently.
 *
 * The behavioural proof runs in mastra-retention.integration.test.mjs against a
 * disposable database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MASTRA_REGRESSION_JOB,
  MASTRA_SPAN_RETENTION_DAYS,
  MASTRA_SPAN_RETENTION_JOB,
  MASTRA_SPAN_RETENTION_SCHEDULE,
  mastraRetentionSql,
} from "../lib/mastra-retention.mjs";

const cliSource = readFileSync(new URL("../cleanup-mastra.mjs", import.meta.url), "utf8");

test("retention functions are SECURITY INVOKER and table-guarded", () => {
  const sql = mastraRetentionSql();
  const invoker = sql.match(/security invoker/gi) ?? [];
  assert.ok(invoker.length >= 5, "expected SECURITY INVOKER on every function");
  assert.match(sql, /to_regclass\('public\.mastra_ai_spans'\)/);
  assert.match(sql, /to_regclass\('public\.mastra_threads'\)/);
  assert.match(sql, /to_regclass\('public\.mastra_messages'\)/);
});

test("the SQL schedules NO recurring job at all", () => {
  const sql = mastraRetentionSql();
  assert.doesNotMatch(sql, /cron\.schedule/);
  assert.doesNotMatch(sql, /cron\.unschedule/);
});

test("anonymous cleanup exists as a one-time function, never a scheduled path", () => {
  const sql = mastraRetentionSql();
  assert.match(sql, /create or replace function public\.mastra_cleanup_anonymous_threads/i);
  assert.match(sql, /ONE-TIME/);
});

test("anonymous cleanup discovers dependents dynamically and fails closed", () => {
  const sql = mastraRetentionSql();
  assert.match(sql, /mastra_anonymous_dependents/);
  assert.match(sql, /unexpectedDependents/);
  assert.match(sql, /refusing to delete anything/);
  assert.match(sql, /No threads or messages were deleted/);
  // dynamic discovery over the live schema, excluding the removed/telemetry tables
  assert.match(sql, /starts_with\(c\.relname, 'mastra_'\)/);
  assert.match(sql, /pg_attribute/);
  assert.match(sql, /mastra_ai_spans/);
});

test("new anonymous threads are rejected at write time with 42501", () => {
  const sql = mastraRetentionSql();
  assert.match(sql, /create or replace function public\.mastra_threads_reject_anonymous/i);
  assert.match(sql, /before insert or update on public\.mastra_threads/i);
  assert.match(sql, /errcode = '42501'/);
  assert.match(sql, /do not auto-delete/i);
});

test("messages cannot reference a missing thread (fail-closed orphan guard)", () => {
  const sql = mastraRetentionSql();
  assert.match(sql, /create or replace function public\.mastra_messages_reject_orphan/i);
  assert.match(sql, /before insert or update of thread_id on public\.mastra_messages/i);
  assert.match(sql, /references missing thread/);
  assert.match(sql, /errcode = '23503'/);
  assert.match(sql, /refusing to create an orphan message/i);
});

test("deleting a thread removes its messages (cascade backstop)", () => {
  const sql = mastraRetentionSql();
  assert.match(sql, /create or replace function public\.mastra_threads_delete_messages/i);
  assert.match(sql, /before delete on public\.mastra_threads/i);
  assert.match(sql, /delete from public\.mastra_messages where thread_id = OLD\.id/i);
});

test("an assertion exists that fails when an anonymous thread is present", () => {
  const sql = mastraRetentionSql();
  assert.match(sql, /create or replace function public\.mastra_assert_no_anonymous_threads/i);
  assert.match(sql, /mastra anonymous-thread regression/i);
  assert.match(sql, /preserve the rows as evidence/i);
});

test("end-user EXECUTE is revoked and service_role is granted", () => {
  const sql = mastraRetentionSql();
  assert.match(sql, /revoke all on function/);
  assert.match(sql, /from anon/);
  assert.match(sql, /from authenticated/);
  assert.match(sql, /grant execute on function/);
});

test("recurring trace retention defaults to 30 days", () => {
  assert.equal(MASTRA_SPAN_RETENTION_DAYS, 30);
  assert.equal(MASTRA_SPAN_RETENTION_JOB, "mastra_span_retention");
  assert.equal(MASTRA_SPAN_RETENTION_SCHEDULE, "20 4 * * *");
  assert.equal(MASTRA_REGRESSION_JOB, "mastra_anonymous_regression_check");
  assert.match(mastraRetentionSql(), /mastra_cleanup_spans/);
});

test("the CLI deletes nothing without --execute", () => {
  assert.match(cliSource, /hasFlag\("--execute"\)/);
  assert.match(cliSource, /dry run only; add --execute/);
});

test("the CLI verify command fails non-zero on a regression", () => {
  assert.match(cliSource, /mastra:retention verify FAILED/);
  assert.match(cliSource, /process\.exitCode = 1/);
});
