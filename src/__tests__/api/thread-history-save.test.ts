import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * SAN-1531 — the discovery fast paths must be able to save their exchange durably.
 *
 * Those answers never run through the agent, so nothing wrote them to Mastra storage and the
 * conversation vanished on refresh. POST stores the same exchange in the tables the history reader
 * already reads. Because the route writes with the service role (RLS bypassed), these tests pin the
 * three things that make it safe: the owner check, the Mastra message shape and idempotent retries.
 */

const getUserMock = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  threads: new Map<string, { id: string; resourceId: string | null }>(),
  rows: [] as Array<Record<string, unknown>>,
  createdThreads: [] as Array<Record<string, unknown>>,
  threadError: null as string | null,
  saveError: null as string | null,
  createError: null as string | null,
  noService: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () =>
    db.noService
      ? null
      : {
          from(table: string) {
            if (table === "mastra_threads") {
              let id = "";
              const builder = {
                select: () => builder,
                eq: (_column: string, value: string) => ((id = value), builder),
                maybeSingle: async () =>
                  db.threadError
                    ? { data: null, error: { message: db.threadError } }
                    : { data: db.threads.get(id) ?? null, error: null },
                insert: async (row: Record<string, unknown>) => {
                  if (db.createError) return { error: { message: db.createError } };
                  db.createdThreads.push(row);
                  db.threads.set(String(row.id), row as { id: string; resourceId: string });
                  return { error: null };
                },
              };
              return builder;
            }
            let pending: Array<Record<string, unknown>> = [];
            const messages = {
              upsert: (rows: Array<Record<string, unknown>>) => {
                pending = rows;
                return messages;
              },
              select: async () => {
                if (db.saveError) return { data: null, error: { message: db.saveError } };
                const inserted = pending.filter((row) => !db.rows.some((r) => r.id === row.id));
                db.rows.push(...inserted);
                return { data: inserted.map((row) => ({ id: row.id })), error: null };
              },
            };
            return messages;
          },
        },
}));

import { POST } from "@/app/api/threads/[threadId]/messages/route";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const THREAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const signInAs = (id: string) => getUserMock.mockResolvedValue({ data: { user: { id } } });

const save = (threadId: string, body: unknown) =>
  POST(
    { json: async () => body } as unknown as NextRequest,
    { params: Promise.resolve({ threadId }) },
  );

const exchange = {
  messages: [
    { id: "local-1-user", role: "user", content: "Find Italian restaurants in El Poblado." },
    { id: "local-2-assistant", role: "assistant", content: "3 Italian spots in El Poblado." },
  ],
};

beforeEach(() => {
  getUserMock.mockReset();
  db.threads.clear();
  db.rows.length = 0;
  db.createdThreads.length = 0;
  db.threadError = null;
  db.saveError = null;
  db.createError = null;
  db.noService = false;
});

describe("SAN-1531 POST /api/threads/[threadId]/messages", () => {
  it("stores the exchange for the thread owner in Mastra's message shape", async () => {
    signInAs(OWNER);
    db.threads.set(THREAD, { id: THREAD, resourceId: OWNER });

    const response = await save(THREAD, exchange);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ threadId: THREAD, saved: 2, requested: 2 });
    expect(db.rows).toHaveLength(2);
    const [user, assistant] = db.rows;
    expect(user).toMatchObject({ thread_id: THREAD, resourceId: OWNER, role: "user", type: "text" });
    // The history reader only parses Mastra's parts format, so a stored string would be invisible.
    expect(JSON.parse(String(user.content))).toEqual({
      format: 2,
      parts: [{ type: "text", text: "Find Italian restaurants in El Poblado." }],
    });
    expect(JSON.parse(String(assistant.content)).parts[0].text).toBe("3 Italian spots in El Poblado.");
  });

  it("creates the thread row when the first turn was a fast-path answer", async () => {
    signInAs(OWNER);

    const response = await save(THREAD, exchange);

    expect(response.status).toBe(200);
    expect(db.createdThreads).toHaveLength(1);
    expect(db.createdThreads[0]).toMatchObject({ id: THREAD, resourceId: OWNER });
    expect(db.rows).toHaveLength(2);
  });

  it("refuses to write into another user's conversation", async () => {
    signInAs(OTHER);
    db.threads.set(THREAD, { id: THREAD, resourceId: OWNER });

    const response = await save(THREAD, exchange);

    expect(response.status).toBe(403);
    expect(db.rows).toHaveLength(0);
  });

  it("requires a signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await save(THREAD, exchange);

    expect(response.status).toBe(401);
    expect(db.rows).toHaveLength(0);
  });

  it("is idempotent: replaying the same save inserts nothing", async () => {
    signInAs(OWNER);
    db.threads.set(THREAD, { id: THREAD, resourceId: OWNER });

    const first = await save(THREAD, exchange);
    const second = await save(THREAD, exchange);

    expect(await first.json()).toMatchObject({ saved: 2 });
    expect(await second.json()).toMatchObject({ saved: 0, requested: 2 });
    expect(db.rows).toHaveLength(2);
  });

  it("rejects a payload it cannot store faithfully", async () => {
    signInAs(OWNER);
    db.threads.set(THREAD, { id: THREAD, resourceId: OWNER });

    for (const body of [
      {},
      { messages: [] },
      { messages: [{ id: "x", role: "system", content: "hi" }] },
      { messages: [{ id: "x", role: "user", content: "   " }] },
      { messages: [{ id: "x", role: "user", content: "a" }, { id: "x", role: "user", content: "b" }] },
    ]) {
      const response = await save(THREAD, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(db.rows).toHaveLength(0);
  });

  it("rejects a non-uuid thread id instead of creating a junk row", async () => {
    signInAs(OWNER);

    const response = await save("not-a-thread", exchange);

    expect(response.status).toBe(400);
    expect(db.createdThreads).toHaveLength(0);
  });

  it("reports a storage failure instead of pretending the save worked", async () => {
    signInAs(OWNER);
    db.threads.set(THREAD, { id: THREAD, resourceId: OWNER });
    db.saveError = "connection reset";

    const response = await save(THREAD, exchange);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "Could not save messages" });
  });
});
