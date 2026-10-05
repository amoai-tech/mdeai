/**
 * SAN-1311 — proves a conversation written by the *previous* production Mastra version
 * is still readable (and writable) by the upgraded one.
 *
 * A scratch test that writes and reads with the new code cannot prove the new code can
 * still read rows the old code left behind — which is exactly what production has
 * (2026-10-05: 502 threads / 1,213 messages, every one role user|assistant, type v2,
 * content.format 2). This seeds the recorded *shape* through raw SQL (bypassing the new
 * code entirely) and then reads it back through the real `Memory` + `PostgresStore`
 * path, including a format-2 tool-invocation part and the JSON working memory.
 *
 * It refuses a non-loopback DATABASE_URL (see integration-db-guard.ts) because it writes
 * rows. It runs in `.github/workflows/floor.yml`'s disposable `mastra-schema-init` job.
 *
 * Run:
 *   DATABASE_URL=postgresql://... MASTRA_LEGACY_COMPAT_INTEGRATION=1 \
 *     npx vitest run src/mastra/lib/storage-legacy-compat.integration.test.ts
 */
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { conciergeWorkingMemorySchema } from "@/mastra/agents/concierge";
import { assertLoopbackDatabaseUrl } from "./integration-db-guard";
import fixture from "./__fixtures__/legacy-production-row.json";

const DATABASE_URL = process.env.DATABASE_URL;
// Flag on means the proof MUST run. A missing DATABASE_URL fails inside the test (the
// guard throws) instead of silently skipping to a green build.
const runIntegration = process.env.MASTRA_LEGACY_COMPAT_INTEGRATION === "1";

describe.runIf(runIntegration)("SAN-1311 legacy production row compatibility", () => {
  it(
    "reads and updates a thread/message/working-memory row written by the previous version",
    async () => {
      assertLoopbackDatabaseUrl(DATABASE_URL, "MASTRA_LEGACY_COMPAT_INTEGRATION");
      const { thread, messages } = fixture;
      // Everything after the guard is constructed inside the try, so whichever resources
      // were created can be closed by the finally if a later construction throws.
      const client = new Client({ connectionString: DATABASE_URL as string });
      let store: PostgresStore | undefined;
      try {
        await client.connect();
        store = new PostgresStore({
          id: "san1311-legacy-compat",
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
        await client.query(
          `insert into public.mastra_threads (id, "resourceId", title, metadata, "createdAt", "updatedAt")
           values ($1, $2, $3, $4::jsonb, $5, $6)
           on conflict (id) do update set
             "resourceId" = excluded."resourceId",
             title = excluded.title,
             metadata = excluded.metadata,
             "updatedAt" = excluded."updatedAt"`,
          [
            thread.id,
            thread.resourceId,
            thread.title,
            JSON.stringify({ workingMemory: thread.workingMemory }),
            thread.createdAt,
            thread.updatedAt,
          ],
        );
        for (const message of messages) {
          await client.query(
            `insert into public.mastra_messages (id, thread_id, content, role, type, "createdAt", "resourceId")
             values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (id) do nothing`,
            [
              message.id,
              thread.id,
              JSON.stringify(message.content),
              message.role,
              message.type,
              message.createdAt,
              thread.resourceId,
            ],
          );
        }

        // 1. The new code resolves the legacy thread and its owner.
        const loaded = await memory.getThreadById({ threadId: thread.id });
        expect(loaded?.resourceId).toBe(thread.resourceId);

        // 2. The legacy JSON working memory is readable and parseable.
        const raw = await memory.getWorkingMemory({
          threadId: thread.id,
          resourceId: thread.resourceId,
        });
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw as string) as {
          lastRentalQuery?: { neighborhood?: string };
          mapUi?: { selectedPinId?: string };
        };
        expect(parsed.lastRentalQuery?.neighborhood).toBe("Laureles");
        expect(parsed.mapUi?.selectedPinId).toBe("legacy-rental-1");

        // 3. Legacy format-2 messages parse, including a tool-invocation part.
        const memStore = (await store.getStore("memory")) as {
          listMessages: (args: { threadId: string; perPage: number }) => Promise<unknown>;
        };
        const listed = (await memStore.listMessages({
          threadId: thread.id,
          perPage: 10,
        })) as { messages?: Array<{ role?: string; content?: unknown }> };
        expect(listed.messages?.length).toBe(2);
        expect(listed.messages?.[0]?.role).toBe("user");
        const serialized = JSON.stringify(listed.messages);
        expect(serialized).toContain("Find me a 2BR in Laureles under 4M");
        expect(serialized).toContain("legacy-call-1");

        // 4. The legacy thread keeps working: a follow-up write is persisted.
        const updated = {
          ...parsed,
          lastIntent: "rental_refine",
          mapUi: { ...(parsed.mapUi ?? {}), selectedPinId: "legacy-rental-2" },
        };
        await memory.updateWorkingMemory({
          threadId: thread.id,
          resourceId: thread.resourceId,
          workingMemory: JSON.stringify(updated),
        });
        const reread = JSON.parse(
          (await memory.getWorkingMemory({
            threadId: thread.id,
            resourceId: thread.resourceId,
          })) as string,
        ) as { lastIntent?: string; mapUi?: { selectedPinId?: string } };
        expect(reread.lastIntent).toBe("rental_refine");
        expect(reread.mapUi?.selectedPinId).toBe("legacy-rental-2");

        // 5. Sofia can keep chatting: append a CURRENT-format turn to the legacy thread and
        // prove both the old and the new messages survive a reload.
        await memory.saveMessages({
          messages: [
            {
              id: `${thread.id}-followup`,
              role: "user",
              createdAt: new Date(),
              threadId: thread.id,
              resourceId: thread.resourceId,
              content: {
                format: 2 as const,
                parts: [{ type: "text" as const, text: "show me cheaper ones" }],
              },
            } as never,
          ],
        });
        const after = (await memStore.listMessages({
          threadId: thread.id,
          perPage: 20,
        })) as { messages?: Array<{ role?: string; content?: unknown }> };
        expect(after.messages?.length).toBe(3);
        const serializedAfter = JSON.stringify(after.messages);
        expect(serializedAfter).toContain("Find me a 2BR in Laureles under 4M");
        expect(serializedAfter).toContain("show me cheaper ones");
      } finally {
        try {
          await client.query("delete from public.mastra_messages where thread_id = $1", [thread.id]);
          await client.query("delete from public.mastra_threads where id = $1", [thread.id]);
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
