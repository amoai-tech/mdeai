import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * SAN-1412 — PATCH /api/threads/[threadId] gives a saved chat a real title.
 *
 * It reads and writes with the service role (RLS bypassed), so the only thing between users is the
 * owner check here: verified user → thread exists → thread belongs to that user → only then read
 * messages → only then update. The browser never sends the title; it is derived from the stored
 * first user message. The private marker must never appear in any refusal.
 */

const getUserMock = vi.hoisted(() => vi.fn());
const updateThreadMock = vi.hoisted(() => vi.fn());
const serviceState = vi.hoisted(() => ({
  threads: new Map<string, { id: string; title: string | null; resourceId: string | null }>(),
  messages: [] as Array<Record<string, unknown>>,
  messagesRead: 0,
  threadError: null as string | null,
  noService: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: getUserMock } })),
}));
vi.mock("@/mastra/lib/storage", () => ({ getMastraStorage: () => ({}) }));
vi.mock("@mastra/memory", () => ({
  Memory: class {
    updateThread = updateThreadMock;
  },
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () =>
    serviceState.noService
      ? null
      : {
          from(table: string) {
            if (table === "mastra_threads") {
              let id = "";
              const q = {
                select: () => q,
                eq: (_c: string, v: string) => ((id = v), q),
                maybeSingle: () => Promise.resolve(
                  serviceState.threadError
                    ? { data: null, error: { message: serviceState.threadError } }
                    : { data: serviceState.threads.get(id) ?? null, error: null },
                ),
              };
              return q;
            }
            serviceState.messagesRead += 1;
            let threadId = "";
            const q = {
              select: () => q,
              eq: (_c: string, v: string) => ((threadId = v), q),
              order: () => q,
              limit: () => Promise.resolve({
                data: serviceState.messages.filter((m) => m.thread_id === threadId),
                error: null,
              }),
            };
            return q;
          },
        },
}));

import { PATCH } from "@/app/api/threads/[threadId]/route";

const MARKER = `sofia-private-${crypto.randomUUID()}`;
const SOFIA = "11111111-1111-4111-8111-111111111111";
const ROBERTO = "22222222-2222-4222-8222-222222222222";
const THREAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const userRow = (text: string, createdAt = "2026-10-01T10:00:00.000Z") => ({
  id: `m-${text}`,
  thread_id: THREAD_A,
  role: "user",
  createdAt,
  content: JSON.stringify({ format: 2, parts: [{ type: "text", text }] }),
});

const call = (threadId: string, body?: unknown) =>
  PATCH({ json: () => Promise.resolve(body) } as unknown as NextRequest, {
    params: Promise.resolve({ threadId }),
  });

beforeEach(() => {
  getUserMock.mockReset();
  updateThreadMock.mockReset();
  updateThreadMock.mockResolvedValue({});
  serviceState.threads.clear();
  serviceState.threads.set(THREAD_A, { id: THREAD_A, title: null, resourceId: SOFIA });
  serviceState.messages = [userRow(`Find me a quiet 2BR in Laureles ${MARKER}`)];
  serviceState.messagesRead = 0;
  serviceState.threadError = null;
  serviceState.noService = false;
});

describe("PATCH /api/threads/[threadId] (SAN-1412)", () => {
  it("refuses a signed-out request with 401 and touches nothing", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await call(THREAD_A);
    expect(res.status).toBe(401);
    expect(serviceState.messagesRead).toBe(0);
    expect(updateThreadMock).not.toHaveBeenCalled();
  });

  it("answers 404 for a thread that does not exist", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    const res = await call("00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect(updateThreadMock).not.toHaveBeenCalled();
  });

  it("refuses another user's thread with 403 BEFORE reading messages or updating, and leaks nothing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ROBERTO } } });
    const res = await call(THREAD_A);
    expect(res.status).toBe(403);
    expect(serviceState.messagesRead).toBe(0);
    expect(updateThreadMock).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json())).not.toContain(MARKER);
  });

  it("titles the owner's untitled chat from the first stored user message, title only", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    const res = await call(THREAD_A);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ updated: true });
    expect(typeof body.title).toBe("string");
    expect(body.title.length).toBeLessThanOrEqual(60);
    expect(updateThreadMock).toHaveBeenCalledTimes(1);
    const arg = updateThreadMock.mock.calls[0][0];
    // Only the id and the title: never a resourceId, metadata or messages.
    expect(Object.keys(arg).sort()).toEqual(["id", "title"]);
    expect(arg.id).toBe(THREAD_A);
    expect(arg.title).toBe(body.title);
  });

  it("repairs the 'Untitled Thread' placeholder too", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    serviceState.threads.set(THREAD_A, { id: THREAD_A, title: "Untitled Thread", resourceId: SOFIA });
    const res = await call(THREAD_A);
    expect((await res.json()).updated).toBe(true);
    expect(updateThreadMock).toHaveBeenCalledTimes(1);
  });

  it("never overwrites a real title, and does not even read messages", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    serviceState.threads.set(THREAD_A, { id: THREAD_A, title: "Weekend events", resourceId: SOFIA });
    const res = await call(THREAD_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ updated: false, title: "Weekend events" });
    expect(serviceState.messagesRead).toBe(0);
    expect(updateThreadMock).not.toHaveBeenCalled();
  });

  it("ignores any title the browser sends", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    await call(THREAD_A, { title: "I choose this title" });
    expect(updateThreadMock.mock.calls[0][0].title).not.toBe("I choose this title");
  });

  it("makes no title when there is no useful user message (the dated fallback stays)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    serviceState.messages = [];
    const res = await call(THREAD_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ updated: false, title: null });
    expect(updateThreadMock).not.toHaveBeenCalled();
  });

  it("does not leak private backend error details from a failed thread lookup", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    serviceState.threadError = `query failure ${MARKER}`;
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = await call(THREAD_A);
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain(MARKER);
      expect(JSON.stringify(logs.mock.calls)).not.toContain(MARKER);
    } finally {
      logs.mockRestore();
    }
  });

  it("answers a controlled 500 without thread or message content when the update fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    updateThreadMock.mockRejectedValue(new Error(`db exploded ${MARKER}`));
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = await call(THREAD_A);
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain(MARKER);
      // Sensitive chat text must not escape into server logs either.
      expect(logs).toHaveBeenCalled();
      expect(JSON.stringify(logs.mock.calls)).not.toContain(MARKER);
    } finally {
      logs.mockRestore();
    }
  });

  it("answers 503 when the server-side client is unavailable", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    serviceState.noService = true;
    expect((await call(THREAD_A)).status).toBe(503);
  });
});
