#!/usr/bin/env node
/**
 * Mastra retention and anonymous-thread regression tooling.
 *
 * Commands (nothing destructive runs without --execute):
 *   install                  apply the retention SQL (functions + regression trigger)
 *   references               read-only impact report for the legacy anonymous threads
 *   anonymous [--execute]    one-time legacy anonymous sweep (dry run by default)
 *   spans [--execute] [--days N]   expire stale mastra_ai_spans (dry run by default)
 *   verify                   assert anonymous thread count = 0 and no orphan messages
 *   enable-trace-retention [--days N]      schedule the recurring 30-day trace job
 *   enable-regression-check                schedule the hourly anonymous-thread assertion
 *
 * Usage through npm:
 *   npm run mastra:cleanup -- references
 *   npm run mastra:cleanup -- anonymous --execute
 *   npm run mastra:cleanup -- verify
 */
import { Client } from "pg";
import {
  MASTRA_REGRESSION_JOB,
  MASTRA_REGRESSION_SCHEDULE,
  MASTRA_SPAN_RETENTION_DAYS,
  MASTRA_SPAN_RETENTION_JOB,
  MASTRA_SPAN_RETENTION_SCHEDULE,
  applyMastraRetention,
} from "./lib/mastra-retention.mjs";

const connectionString = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "").trim();
if (!connectionString) {
  console.error("mastra:retention: DATABASE_URL is required.");
  process.exit(1);
}

const argv = process.argv.slice(2);
const command = argv[0] ?? "help";
const hasFlag = (flag) => argv.includes(flag);
const flagValue = (flag, fallback) => {
  const index = argv.indexOf(flag);
  return index !== -1 ? argv[index + 1] : fallback;
};

function print(value) {
  console.log(JSON.stringify(value));
}

async function one(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return rows[0]?.result ?? rows[0]?.n ?? rows[0] ?? null;
}

async function requireCron(client) {
  const present = await one(client, "select to_regclass('cron.job') is not null as result");
  if (!present) {
    throw new Error("pg_cron is not available on this database; cannot schedule a job.");
  }
}

async function schedule(client, name, scheduleExpr, sqlCommand) {
  await client.query("select cron.unschedule(jobname) from cron.job where jobname = $1", [name]);
  await client.query("select cron.schedule($1, $2, $3)", [name, scheduleExpr, sqlCommand]);
}

function help() {
  console.log([
    "mastra:retention commands:",
    "  install",
    "  references",
    "  anonymous [--execute]",
    "  spans [--execute] [--days N]",
    "  verify",
    "  enable-trace-retention [--days N]",
    "  enable-regression-check",
  ].join("\n"));
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    if (command === "install") {
      await applyMastraRetention(client);
      console.log("mastra:retention install OK");
      return;
    }
    if (command === "references") {
      print(await one(client, "select public.mastra_anonymous_references() as result"));
      return;
    }
    if (command === "anonymous") {
      const execute = hasFlag("--execute");
      // Reference analysis first. Execute refuses (inside the SQL function) when any
      // unexpected anonymous-owned dependent record exists, so nothing is ever
      // partially deleted.
      print(await one(client, "select public.mastra_anonymous_references() as result"));
      const result = await one(
        client,
        "select public.mastra_cleanup_anonymous_threads($1::boolean) as result",
        [!execute],
      );
      print(result);
      if (!execute) {
        console.log(
          result && result.blocked
            ? "BLOCKED: unexpected anonymous dependents exist; nothing would be deleted. Investigate before --execute."
            : "dry run only; add --execute after review",
        );
      } else {
        console.log("one-time anonymous cleanup executed");
      }
      return;
    }
    if (command === "spans") {
      const days = Number.parseInt(flagValue("--days", String(MASTRA_SPAN_RETENTION_DAYS)), 10);
      if (!Number.isInteger(days) || days < 1) {
        throw new Error("--days must be a positive integer");
      }
      const execute = hasFlag("--execute");
      print(await one(
        client,
        "select public.mastra_cleanup_spans($1::integer, $2::boolean) as result",
        [days, !execute],
      ));
      console.log(execute ? "span retention executed" : "dry run only; add --execute to delete");
      return;
    }
    if (command === "verify") {
      const anonymousThreads = await one(client, "select public.mastra_anonymous_thread_count() as n");
      const orphanMessages = await one(client, "select public.mastra_orphan_message_count() as n");
      print({ anonymousThreads, orphanMessages });
      if (anonymousThreads !== 0 || orphanMessages !== 0) {
        console.error("mastra:retention verify FAILED");
        process.exitCode = 1;
      } else {
        console.log("mastra:retention verify OK");
      }
      return;
    }
    if (command === "enable-trace-retention") {
      const days = Number.parseInt(flagValue("--days", String(MASTRA_SPAN_RETENTION_DAYS)), 10);
      if (!Number.isInteger(days) || days < 1) {
        throw new Error("--days must be a positive integer");
      }
      await requireCron(client);
      await schedule(
        client,
        MASTRA_SPAN_RETENTION_JOB,
        MASTRA_SPAN_RETENTION_SCHEDULE,
        "select public.mastra_cleanup_spans(" + days + ", false)",
      );
      console.log("scheduled " + MASTRA_SPAN_RETENTION_JOB + " (" + MASTRA_SPAN_RETENTION_SCHEDULE + ")");
      return;
    }
    if (command === "enable-regression-check") {
      await requireCron(client);
      await schedule(
        client,
        MASTRA_REGRESSION_JOB,
        MASTRA_REGRESSION_SCHEDULE,
        "select public.mastra_assert_no_anonymous_threads()",
      );
      console.log("scheduled " + MASTRA_REGRESSION_JOB + " (" + MASTRA_REGRESSION_SCHEDULE + ")");
      return;
    }
    help();
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("mastra:retention FAILED - " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
