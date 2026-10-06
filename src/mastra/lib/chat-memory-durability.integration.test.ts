/**
 * SAN-548 — proves a real renter conversation survives a fresh PostgresStore + Memory
 * recreation (persistence/reopen, not a new OS process).
 *
 * Real journey: Camila says "furnished 2BR in Laureles under 5M", then corrects to 4M.
 * The store is closed and a new one opens. She reloads the same thread and must still see
 * "furnished" in message history, the modeled fields (Laureles, 2BR, current 4M + budget
 * type) in thread-scoped working memory, and Roberto must be denied.
 *
 * This is the missing L2 proof (close -> fresh store/Memory -> reload); the existing
 * legacy-compat test proves old ROWS stay readable after an upgrade. True fresh-process /
 * deployment continuity belongs to SAN-548 Task 4 (production journey).
 *
 * Opt-in, disposable-database only (writes rows):
 *   DATABASE_URL=postgresql://... MASTRA_CHAT_MEMORY_DURABILITY=1 \
 *     npx vitest run src/mastra/lib/chat-memory-durability.integration.test.ts
 *
 * Runs in .github/workflows/floor.yml's disposable mastra-schema-init job. It refuses a
 * non-loopback DATABASE_URL (integration-db-guard.ts).
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { NextRequest } from "next/server";
import { evaluateCopilotKitAuth } from "@/lib/copilotkit-auth";
import { conciergeWorkingMemorySchema } from "@/mastra/agents/concierge";
import { assertLoopbackDatabaseUrl } from "./integration-db-guard";

const DATABASE_URL = process.env.DATABASE_URL;
// Flag on means the proof MUST run. A missing DATABASE_URL fails inside the test (the
// guard throws) instead of silently skipping to a green build.
const runIntegration = process.env.MASTRA_CHAT_MEMORY_DURABILITY === "1";

/** Build a production-shaped (format 2) stored message. */
function turn(
  threadId: string,
  resourceId: string,
  index: number,
  role: "user" | "assistant",
  text: string,
): Parameters<Memory["saveMessages"]>[0]["messages"][number] {
  return {
    id: threadId + "-m" + index,
    role,
    createdAt: new Date(Date.now() + index * 1000),
    threadId,
    resourceId,
    content: { format: 2, parts: [{ type: "text", text }] },
  };
}

describe.runIf(runIntegration)("SAN-548 rental chat memory durability", () => {
  it(
    "survives a fresh store/runtime and keeps per-user isolation",
    async () => {
      assertLoopbackDatabaseUrl(DATABASE_URL, "MASTRA_CHAT_MEMORY_DURABILITY");

      const run = "san548-" + randomUUID().slice(0, 8);
      const threadId = run + "-thread";
      const userA = run + "-user-a";
      const userB = run + "-user-b";

      const client = new Client({ connectionString: DATABASE_URL as string });
      let store: PostgresStore | undefined;
      try {
        await client.connect();

        // --- 1. Store A: create the thread and persist a realistic conversation -----
        store = new PostgresStore({
          id: run + "-store-1",
          connectionString: DATABASE_URL as string,
          disableInit: true,
        });
        let memory = new Memory({
          storage: store,
          options: {
            workingMemory: { enabled: true, scope: "thread", schema: conciergeWorkingMemorySchema },
            lastMessages: 10,
          },
        });
        await memory.createThread({ threadId, resourceId: userA });

        const conversation: Array<["user" | "assistant", string]> = [
          ["user", "Hola, busco un apartamento amoblado (furnished) en Laureles"],
          ["assistant", "Con gusto. ¿Cuántas habitaciones y cuál es tu presupuesto?"],
          ["user", "2 habitaciones, presupuesto 5.000.000 COP por mes"],
          ["assistant", "Entendido: 2BR amoblado en Laureles, tope 5M/mes."],
          ["user", "Que tenga balcón si es posible"],
          ["assistant", "Anotado. Reviso opciones con balcón."],
          ["user", "Mejor cerca del metro"],
          ["assistant", "Perfecto, priorizo cercanía al metro."],
          ["user", "¿Alguna incluye servicios?"],
          ["assistant", "Voy a verificar cuáles incluyen servicios."],
          ["user", "Ah, y el presupuesto mejor 4.000.000 COP por mes"],
          ["assistant", "Actualizo el tope a 4M/mes. Sigo buscando 2BR amoblado en Laureles."],
        ];
        const messages = conversation.map(([role, text], i) =>
          turn(threadId, userA, i, role, text),
        );
        await memory.saveMessages({ messages });
        expect(messages.length).toBeGreaterThanOrEqual(10);

        // --- 2. Modeled structured memory, with a 5M -> 4M correction ---------------
        const query = (maxPricePerNight: number) =>
          JSON.stringify({
            lastIntent: "rental_search",
            lastRentalQuery: {
              neighborhood: "Laureles",
              minBedrooms: 2,
              maxPricePerNight,
              budgetType: "monthly",
            },
          });
        await memory.updateWorkingMemory({
          threadId,
          resourceId: userA,
          workingMemory: query(5_000_000),
        });
        await memory.updateWorkingMemory({
          threadId,
          resourceId: userA,
          workingMemory: query(4_000_000),
        });

        // --- 3. Restart: close the store and open a genuinely fresh one -------------
        await store.close();
        store = undefined;
        memory = undefined as unknown as Memory;
        store = new PostgresStore({
          id: run + "-store-2",
          connectionString: DATABASE_URL as string,
          disableInit: true,
        });
        memory = new Memory({
          storage: store,
          options: {
            workingMemory: { enabled: true, scope: "thread", schema: conciergeWorkingMemorySchema },
            lastMessages: 10,
          },
        });

        // --- 4. Reload the same thread as Camila -----------------------------------
        const loaded = await memory.getThreadById({ threadId });
        expect(loaded?.resourceId).toBe(userA);

        const raw = await memory.getWorkingMemory({ threadId, resourceId: userA });
        expect(raw).toBeTruthy();
        const wm = JSON.parse(raw as string) as {
          lastRentalQuery?: {
            neighborhood?: string;
            minBedrooms?: number;
            maxPricePerNight?: number;
            budgetType?: string;
          };
        };
        expect(wm.lastRentalQuery?.neighborhood).toBe("Laureles");
        expect(wm.lastRentalQuery?.minBedrooms).toBe(2);
        expect(wm.lastRentalQuery?.maxPricePerNight).toBe(4_000_000);
        expect(wm.lastRentalQuery?.budgetType).toBe("monthly");
        // The stale 5M must not win.
        expect(JSON.stringify(wm)).not.toContain("5000000");

        const memStore = (await store.getStore("memory")) as {
          listMessages: (args: { threadId: string; perPage: number }) => Promise<unknown>;
        };
        const listed = (await memStore.listMessages({ threadId, perPage: 40 })) as {
          messages?: Array<{ role?: string; content?: unknown }>;
        };
        expect(listed.messages?.length).toBe(12);
        const serialized = JSON.stringify(listed.messages);
        // "furnished" is NOT modeled in working memory — it must survive in history.
        expect(serialized.toLowerCase()).toContain("furnished");
        expect(serialized).toContain("Laureles");
        expect(serialized.toLowerCase()).toContain("4.000.000");

        // --- 5. Per-user isolation through the REAL auth gate ----------------------
        const requestBody = JSON.stringify({ method: "agent/run", body: { threadId } });
        const asUser = (userId: string) =>
          evaluateCopilotKitAuth(
            new NextRequest("https://www.mdeai.co/api/copilotkit", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: requestBody,
            }),
            // Bind to the owner actually reloaded from storage, not a duplicated literal.
            { userId, thread: { kind: "existing", threadId, resourceId: loaded?.resourceId ?? null } },
          );
        const denied = asUser(userB);
        expect(denied.allowed).toBe(false);
        if (!denied.allowed) expect(denied.status).toBe(403);
        const allowed = asUser(userA);
        expect(allowed.allowed).toBe(true);

        // The durable owner cannot be reassigned either (existing SAN-547 trigger).
        await expect(
          client.query('update public.mastra_threads set "resourceId" = $1 where id = $2', [
            userB,
            threadId,
          ]),
        ).rejects.toMatchObject({ code: "42501" });
        const owner = await client.query('select "resourceId" from public.mastra_threads where id = $1', [
          threadId,
        ]);
        expect(owner.rows[0].resourceId).toBe(userA);

        // --- 6. No anonymous/orphan regression ------------------------------------
        const anon = await client.query(
          "select count(*)::int as n from public.mastra_threads where \"resourceId\" = 'anonymous'",
        );
        const orphans = await client.query(
          "select count(*)::int as n from public.mastra_messages m left join public.mastra_threads t on t.id = m.thread_id where t.id is null",
        );
        expect(anon.rows[0].n).toBe(0);
        expect(orphans.rows[0].n).toBe(0);
      } finally {
        try {
          await client.query("delete from public.mastra_messages where thread_id = $1", [threadId]);
          await client.query("delete from public.mastra_threads where id = $1", [threadId]);
        } catch {
          // The connection may never have opened; best-effort cleanup only.
        }
        if (store) await store.close().catch(() => undefined);
        await client.end().catch(() => undefined);
      }
    },
    120_000,
  );
});
