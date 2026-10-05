/// <reference types="vite/client" />
/**
 * SAN-1338 — proves which `mastra_*` tables the upgraded runtime touches on a normal
 * memory path, so the extra tables the certified adapter creates are not silently
 * required by production (`src/mastra/lib/storage.ts` runs with `disableInit: true`).
 *
 * It checks both writes (row counts) and accesses (`pg_stat_user_tables` scans + tuple
 * writes), so a read of an adapter-extra table is detected, not just a write.
 *
 * A stronger but destructive variant is to drop the adapter extras from a throwaway DB
 * and re-run the path (it must still succeed). This test stays non-destructive on
 * purpose; the access counters cover the same risk without DDL.
 *
 * Run against a scratch Postgres:
 *   DATABASE_URL=postgresql://... MASTRA_TABLE_USAGE_INTEGRATION=1 \
 *     npx vitest run src/mastra/lib/storage-runtime-tables.integration.test.ts
 *
 * This is a manual/local proof: it is gated on DATABASE_URL + the flag, so the standard
 * `npm test` / `npm run floor` pipeline skips it. `.github/workflows/floor.yml`'s
 * `mastra-schema-init` job already provisions a postgres:17 service and runs
 * `mastra:init`, so setting the flag on that step would give this assertion CI
 * coverage; that workflow change needs approval first.
 */
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { conciergeWorkingMemorySchema } from "@/mastra/agents/concierge";

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration =
  Boolean(DATABASE_URL) && process.env.MASTRA_TABLE_USAGE_INTEGRATION === "1";

const RUNTIME_WRITE_TABLES = ["mastra_messages", "mastra_threads"];

// Root-absolute glob (same pattern as check-mastra-schema-contract.test.ts): resolved
// by Vite from the project root, so it is robust to both cwd and this file moving.
const CONTRACT_SOURCES = import.meta.glob("/scripts/mastra-schema-contract.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const contractRaw = Object.values(CONTRACT_SOURCES)[0];
if (typeof contractRaw !== "string") {
  throw new Error("committed contract not found via import.meta.glob");
}
const contract = JSON.parse(contractRaw) as { adapterInitExtraTables?: string[] };
const ADAPTER_EXTRA_TABLES = contract.adapterInitExtraTables ?? [];

type Counts = Record<string, number>;
type Access = { scans: number; writes: number };
type Accesses = Record<string, Access>;

const MASTRA_TABLE = /^mastra_[a-z0-9_]+$/;

async function tableCounts(client: Client): Promise<Counts> {
  const { rows } = await client.query("select tablename from pg_tables where schemaname = 'public' and tablename like 'mastra_%'");
  const counts: Counts = {};
  for (const row of rows as Array<{ tablename: string }>) {
    // A table name cannot be parameterized. Only ever interpolate a catalog name that
    // matches MDE's strict mastra_ identifier, so nothing untrusted reaches the SQL.
    if (!MASTRA_TABLE.test(row.tablename)) {
      throw new Error(`unexpected table name from catalog: ${row.tablename}`);
    }
    const result = await client.query(`select count(*)::int as n from public."${row.tablename}"`);
    counts[row.tablename] = (result.rows[0] as { n: number } | undefined)?.n ?? 0;
  }
  return counts;
}

async function tableAccesses(client: Client): Promise<Accesses> {
  const { rows } = await client.query(
    "select relname, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del from pg_stat_user_tables where relname like 'mastra_%'",
  );
  const accesses: Accesses = {};
  for (const row of rows as Array<Record<string, string>>) {
    const n = (value: string | null) => Number(value ?? 0);
    accesses[row.relname] = {
      scans: n(row.seq_scan) + n(row.idx_scan),
      writes: n(row.n_tup_ins) + n(row.n_tup_upd) + n(row.n_tup_del),
    };
  }
  return accesses;
}

describe.runIf(runIntegration)("SAN-1338 runtime table usage", () => {
  it(
    "a thread + messages + working-memory path touches only the required tables",
    async () => {
      const client = new Client({ connectionString: DATABASE_URL as string });
      await client.connect();
      const store = new PostgresStore({
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
      try {
        // Sample the counters next to the path, not next to the (self-polluting)
        // row-count queries.
        const countsBefore = await tableCounts(client);
        const accessBefore = await tableAccesses(client);

        const threadId = `san1338-usage-${Date.now()}`;
        const resourceId = "san1338-usage-user";
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

        const accessAfter = await tableAccesses(client);
        const countsAfter = await tableCounts(client);

        const changed = Object.keys(countsAfter).filter(
          (table) => (countsAfter[table] ?? 0) !== (countsBefore[table] ?? 0),
        );
        expect(changed.sort()).toEqual([...RUNTIME_WRITE_TABLES].sort());

        // A read (scan) or write of an adapter-extra table would change these.
        for (const table of ADAPTER_EXTRA_TABLES) {
          const before = accessBefore[table] ?? { scans: 0, writes: 0 };
          const after = accessAfter[table] ?? before;
          expect(after.scans, `${table} scans`).toBe(before.scans);
          expect(after.writes, `${table} writes`).toBe(before.writes);
        }
      } finally {
        await client.end();
        await store.close();
      }
    },
    120_000,
  );
});
