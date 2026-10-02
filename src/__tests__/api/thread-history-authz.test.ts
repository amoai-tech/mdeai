import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * SAN-1389 — GET /api/threads/[threadId]/messages is owner-checked.
 *
 * The route reads with the service role (RLS bypassed), so the only thing
 * standing between users is this check. The private marker below must never
 * appear in any refusal.
 */

const getUserMock = vi.hoisted(() => vi.fn());
const serviceState = vi.hoisted(() => ({
  threads: new Map<string, { id: string; resourceId: string | null }>(),
  messages: [] as Array<Record<string, unknown>>,
  messagesRead: 0,
  threadError: null as string | null,
  noService: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
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
                maybeSingle: async () =>
                  serviceState.threadError
                    ? { data: null, error: { message: serviceState.threadError } }
                    : { data: serviceState.threads.get(id) ?? null, error: null },
              };
              return q;
            }
            serviceState.messagesRead += 1;
            let threadId = "";
            const q = {
              select: () => q,
              eq: (_c: string, v: string) => ((threadId = v), q),
              order: () => q,
              limit: async () => ({
                data: serviceState.messages.filter((m) => m.thread_id === threadId),
                error: null,
              }),
            };
            return q;
          },
        },
}));

import { GET } from "@/app/api/threads/[threadId]/messages/route";

const MARKER = `sofia-private-${crypto.randomUUID()}`;
const SOFIA = "11111111-1111-4111-8111-111111111111";
const ROBERTO = "22222222-2222-4222-8222-222222222222";
const THREAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const call = async (threadId: string) =>
  GET({} as NextRequest, { params: Promise.resolve({ threadId }) });

beforeEach(() => {
  getUserMock.mockReset();
  serviceState.threads.clear();
  serviceState.threads.set(THREAD_A, { id: THREAD_A, resourceId: SOFIA });
  serviceState.messages = [
    {
      id: "m1",
      thread_id: THREAD_A,
      role: "user",
      createdAt: "2026-10-01T10:00:00.000Z",
      content: JSON.stringify({ format: 2, parts: [{ type: "text", text: MARKER }] }),
    },
  ];
  serviceState.messagesRead = 0;
  serviceState.threadError = null;
  serviceState.noService = false;
});

describe("GET /api/threads/[threadId]/messages", () => {
  it("returns the owner's history", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    const res = await call(THREAD_A);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.messages).toEqual([{ id: "m1", role: "user", content: MARKER }]);
  });

  it("401 with no session, and reads nothing", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await call(THREAD_A);
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(MARKER);
    expect(serviceState.messagesRead).toBe(0);
  });

  it("403 for another user's thread, with zero content and no message read", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ROBERTO } } });
    const res = await call(THREAD_A);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain(MARKER);
    expect(serviceState.messagesRead).toBe(0);
  });

  it("403 for a legacy thread with no owner or the shared 'anonymous' owner", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    for (const resourceId of [null, "anonymous"]) {
      serviceState.threads.set("legacy", { id: "legacy", resourceId });
      expect((await call("legacy")).status).toBe(403);
    }
    expect(serviceState.messagesRead).toBe(0);
  });

  it("404 for an unknown thread", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    const res = await call("does-not-exist");
    expect(res.status).toBe(404);
    expect(serviceState.messagesRead).toBe(0);
  });

  it("fails closed (5xx, no content) when ownership cannot be checked", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SOFIA } } });
    serviceState.threadError = "db down";
    const failed = await call(THREAD_A);
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain(MARKER);

    serviceState.threadError = null;
    serviceState.noService = true;
    expect((await call(THREAD_A)).status).toBe(503);
    expect(serviceState.messagesRead).toBe(0);
  });
});
