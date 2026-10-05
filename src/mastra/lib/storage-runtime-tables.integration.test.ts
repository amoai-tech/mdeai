/**
 * SAN-1338 — proves which `mastra_*` tables the upgraded runtime touches on a normal
 * memory path, so the extra tables the certified adapter creates are not silently
 * required by production (`src/mastra/lib/storage.ts` runs with `disableInit: true`).
 *
 * Run against a scratch Postgres:
 *   DATABASE_URL=postgresql://... MASTRA_TABLE_USAGE_INTEGRATION=1 \
 *     npx vitest run src/mastra/lib/storage-runtime-tables.integration.test.ts
 *
 * This is a manual/local proof: it is gated on DATABASE_URL + the flag, so the standard
 * `npm test` / `npm run floor` pipeline skips it. The `.github/workflows/floor.yml`
 * `mastra-schema-init` job already provisions a postgres:17 service and runs
 * `mastra:init`, so wiring this assertion there (set the flag on that step) would give
 * it CI coverage; that workflow change needs approval first.
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
const ADAPTER_EXTRA_TABLES = [
  "mastra_thread_state",
  "mastra_notifications",
  "mastra_workflow_definitions",
  "mastra_knowledge_nodes",
  "mastra_tool_provider_connections",
];

async function tableCounts(): Promise<Record<string, number>> {
  const client = new Client({ connectionString: DATABASE_URL as string });
  await client.connect();
  try {
    const { rows } = await client.query("select tablename from pg_tables where schemaname = 'public' and tablename like 'mastra_%'");
    const counts: Record<string, number> = {};
    for (const row of rows as Array<{ tablename: string }>) {
      const result = await client.query(`select count(*)::int as n from public."${row.tablename}"`);
      counts[row.tablename] = (result.rows[0] as { n: number } | undefined)?.n ?? 0;
    }
    return counts;
  } finally {
    await client.end();
  }
}

describe.runIf(runIntegration)("SAN-1338 runtime table usage", () => {
  it(
    "a thread + messages + working-memory write touches only the required tables",
    async () => {
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
      const before = await tableCounts();
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
      const after = await tableCounts();

      const changed = Object.keys(after).filter((t) => (after[t] ?? 0) !== (before[t] ?? 0));
      expect(changed.sort()).toEqual([...RUNTIME_WRITE_TABLES].sort());
      for (const table of ADAPTER_EXTRA_TABLES) {
        expect(after[table] ?? 0, `${table} must stay unused`).toBe(before[table] ?? 0);
      }
      await store.close();
    },
    120_000,
  );
});
