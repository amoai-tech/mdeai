/**
 * Mastra retention + anonymous-thread regression guard.
 *
 * Applied by scripts/init-mastra-schema.mjs and scripts/cleanup-mastra.mjs. The
 * public.mastra_* tables are vendor-owned and only exist after mastra:init, so this
 * is deliberately NOT a supabase/migrations file.
 *
 * Scheduling is not done here. Recurring trace retention and the regression health
 * check are explicit, opt-in CLI steps so a new anonymous thread can never be
 * silently deleted by a nightly job.
 */
import { readFileSync } from "node:fs";

const SQL_URL = new URL("./mastra-retention.sql", import.meta.url);

/** Default span retention window (days). */
export const MASTRA_SPAN_RETENTION_DAYS = 30;
/** Recurring trace-retention cron job name. */
export const MASTRA_SPAN_RETENTION_JOB = "mastra_span_retention";
/** Daily schedule for trace retention. */
export const MASTRA_SPAN_RETENTION_SCHEDULE = "20 4 * * *";
/** Recurring regression health-check job name. */
export const MASTRA_REGRESSION_JOB = "mastra_anonymous_regression_check";
/** Hourly regression health-check schedule. */
export const MASTRA_REGRESSION_SCHEDULE = "15 * * * *";
/** The shared bucket that must never receive a new thread. */
export const ANONYMOUS_RESOURCE_ID = "anonymous";

/** The provisioning SQL, read from the sibling .sql file. */
export function mastraRetentionSql() {
  return readFileSync(SQL_URL, "utf8");
}

/** Apply the functions, trigger, and grants. Idempotent. */
export async function applyMastraRetention(client) {
  await client.query(mastraRetentionSql());
}

/** Open a client, apply the retention SQL, close it. */
export async function applyMastraRetentionTo(connectionString) {
  // Lazy so a consumer that only reads the SQL needs no database driver.
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await applyMastraRetention(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}
