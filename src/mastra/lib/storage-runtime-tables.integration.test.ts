/**
 * SAN-1338 — proves which `mastra_*` tables the upgraded runtime **writes** on a normal
 * memory path, so the extra tables the certified adapter creates are not silently
 * required by production (`src/mastra/lib/storage.ts` runs with `disableInit: true`).
 *
 * Writes are checked synchronously via row counts, which is deterministic. To also
 * prove the path never **reads** an adapter-extra table, run the minimal-schema check on
 * a throwaway DB: `npm run mastra:init`, drop/rename every `adapterInitExtraTables`
 * entry, then re-run this path — a missing-relation error proves a read dependency.
 * (A `pg_stat_user_tables` access-counter variant was tried and removed: the counters
 * were not reliably observable here even after `pg_stat_clear_snapshot()`.)
 *
 * Run against a scratch Postgres:
 *   DATABASE_URL=postgresql://... MASTRA_TABLE_USAGE_INTEGRATION=1 \
 *     npx vitest run src/mastra/lib/storage-runtime-tables.integration.test.ts
 *
 * This is gated on DATABASE_URL + the flag, so the standard `npm test` / `npm run floor`
 * pipeline skips it. It runs automatically in `.github/workflows/floor.yml`'s
 * `mastra-schema-init` job, which provisions a disposable postgres:17 service and runs
 * `mastra:init`. It refuses a non-loopback DATABASE_URL (see `integration-db-guard.ts`)
 * so it can never write test rows into a remote production database.
 */
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { conciergeWorkingMemorySchema } from "@/mastra/agents/concierge";
import { assertLoopbackDatabaseUrl } from "./integration-db-guard";

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration =
  Boolean(DATABASE_URL) && process.env.MASTRA_TABLE_USAGE_INTEGRATION === "1";

const RUNTIME_WRITE_TABLES = ["mastra_messages", "mastra_threads"];
const MASTRA_TABLE = /^mastra_[a-z0-9_]+$/;

async function tableCounts(client: Client): Promise<Record<string, number>> {
  const { rows } = await client.query("select tablename from pg_tables where schemaname = 'public' and tablename like 'mastra_%'");
  const counts: Record<string, number> = {};
  for (const row of rows as Array<{ tablename: string }>) {
    // Identifiers cannot be parameters; the name is a validated catalog value quoted
    // with format('%I'), so nothing untrusted reaches the SQL.
    if (!MASTRA_TABLE.test(row.tablename)) {
      throw new Error(`unexpected table name from catalog: ${row.tablename}`);
    }
    const result = await client.query(
      "select (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', $1::text, $2::text), false, true, '')))[1]::text::int as n",
      ["public", row.tablename],
    );
    counts[row.tablename] = (result.rows[0] as { n: number } | undefined)?.n ?? 0;
  }
  return counts;
}

describe.runIf(runIntegration)("SAN-1338 runtime table usage", () => {
  it(
    "a thread + messages + working-memory path writes only the required tables",
    async () => {
      assertLoopbackDatabaseUrl(DATABASE_URL, "MASTRA_TABLE_USAGE_INTEGRATION");
      const client = new Client({ connectionString: DATABASE_URL as string });
      // Identity is created before the try so cleanup can reach it even if construction
      // fails partway through.
      const threadId = `san1338-usage-${Date.now()}`;
      const resourceId = "san1338-usage-user";
      let store: PostgresStore | undefined;
      try {
        await client.connect();
        store = new PostgresStore({
          id: "san1338-runtime-tables",
          connectionString: DATABASE_URL as string,
          disableInit: true,
        });
        const memory = new Memory({
          storage: store,
          options: {
            workingMemory: {
              enabled: true,
              scope: "thread",
              schema: conciergeWorkingMemorySchema,
            },
            lastMessages: 20,
          },
        });

        const countsBefore = await tableCounts(client);
        await memory.saveThread({
          thread: {
            id: threadId,
            resourceId,
            title: "usage",
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: {},
          } as never,
        });
        await memory.saveMessages({
          messages: [
            {
              id: `${threadId}-m1`,
              role: "user",
              createdAt: new Date(),
              threadId,
              resourceId,
              content: { format: 2 as const, parts: [{ type: "text" as const, text: "find a rental" }] },
            } as never,
          ],
        });
        await memory.updateWorkingMemory({
          threadId,
          resourceId,
          workingMemory: JSON.stringify({ mapUi: { selectedPinId: "rental-1" } }),
        });
        await memory.recall({ threadId, resourceId, perPage: 50 });

        const countsAfter = await tableCounts(client);
        const changed = Object.keys(countsAfter).filter(
          (table) => (countsAfter[table] ?? 0) !== (countsBefore[table] ?? 0),
        );
        expect(changed.sort()).toEqual([...RUNTIME_WRITE_TABLES].sort());
      } finally {
        // Close the store first, then remove exactly the rows this proof created, then
        // disconnect. Every step is guarded so cleanup cannot mask the test result, and a
        // reusable scratch database is left as it was found.
        if (store) await store.close().catch(() => undefined);
        try {
          await client.query("delete from public.mastra_messages where thread_id = $1", [threadId]);
          await client.query("delete from public.mastra_threads where id = $1", [threadId]);
        } catch {
          // The connection may never have opened; best-effort cleanup only.
        }
        await client.end().catch(() => undefined);
      }
    },
    120_000,
  );
});
