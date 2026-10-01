import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable } from "rxjs";
import { AbstractAgent, EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/client";

/**
 * SAN-1358 · D20 — the runtime's thread resource routes are not a way around
 * thread ownership.
 *
 * The default in-memory runner keeps every thread of the process in one map
 * with no owner, and its thread routes answer for any id: `threads/list`
 * lists them all, `threads/messages|events|state` return any thread's history,
 * `threads/clear` wipes them all. In single-route mode those operations arrive
 * as a `resource/request` envelope whose thread id sits inside `params.path`,
 * which MDE's body-based ownership gate never reads, so on 2026-10-01 a
 * second signed-in user could read and wipe the first user's conversation.
 *
 * This drives the REAL route and the REAL v2 runtime (in-memory runner). Only
 * the Supabase session, the rate limiter and the database ownership lookup
 * are faked, and a stub agent replies with a known secret so a leak is
 * unambiguous.
 */

const getUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}));
vi.mock("@/lib/copilotkit-distributed-rate-limit", () => ({
  checkCopilotKitDistributedIpHardCeiling: vi.fn(async () => null),
  checkCopilotKitDistributedRateLimit: vi.fn(async () => null),
}));
vi.mock("@/mastra/lib/log-agent-run", () => ({ logAgentRunForTurn: vi.fn() }));
// Real thread-id extraction; only the database lookup is replaced: a named
// thread is treated as new, i.e. created by and owned by the caller.
vi.mock("@/lib/copilotkit-thread-ownership", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/copilotkit-thread-ownership")>();
  return {
    ...real,
    resolveRequestedThread: async (req: Parameters<typeof real.readRequestedThreadId>[0]) => {
      const threadId = await real.readRequestedThreadId(req);
      return threadId ? { kind: "new", threadId } : { kind: "none" };
    },
  };
});

const SECRET = "SECRET-OF-USER-A";

class SecretAgent extends AbstractAgent {
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      const messageId = `m-${input.runId}`;
      const emit = (event: Record<string, unknown>) => subscriber.next(event as unknown as BaseEvent);
      emit({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId });
      emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" });
      emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: SECRET });
      emit({ type: EventType.TEXT_MESSAGE_END, messageId });
      emit({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId });
      subscriber.complete();
    });
  }
  clone() {
    return new SecretAgent({ agentId: this.agentId });
  }
}
vi.mock("@/mastra/copilotkit/logging-mastra-agent", () => ({
  getLocalAgentsWithLogging: () => ({ conciergeAgent: new SecretAgent({ agentId: "conciergeAgent" }) }),
}));

import { POST } from "@/app/api/copilotkit/[[...path]]/route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/copilotkit", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.90" },
      body: JSON.stringify(body),
    }) as never,
  );
const resource = (path: string, httpMethod = "GET", body?: unknown) =>
  post({ method: "resource/request", params: { path, httpMethod }, ...(body ? { body } : {}) });
const signInAs = (id: string) => getUserMock.mockResolvedValue({ data: { user: { id } } });

let threadA: string;

async function userARunsAConversation() {
  signInAs("user-a");
  threadA = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const res = await post({
    method: "agent/run",
    params: { agentId: "conciergeAgent" },
    body: {
      threadId: threadA,
      runId,
      messages: [{ id: crypto.randomUUID(), role: "user", content: "hi" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    },
  });
  expect(res.status).toBe(200);
  expect(await res.text()).toContain(SECRET);
}

beforeEach(async () => {
  process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";
  delete process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT;
  getUserMock.mockReset();
  await userARunsAConversation();
  signInAs("user-b");
});

describe("thread resource routes cannot be used across users", () => {
  it("user B cannot list threads", async () => {
    for (const path of ["/api/copilotkit/threads", "/api/copilotkit/threads?agentId=conciergeAgent"]) {
      const res = await resource(path);
      const text = await res.text();
      expect(res.status, path).toBe(403);
      expect(text).not.toContain(threadA);
    }
  });

  for (const suffix of ["messages", "events", "state"]) {
    it(`user B cannot read thread A's ${suffix}`, async () => {
      const res = await resource(`/api/copilotkit/threads/${threadA}/${suffix}`);
      const text = await res.text();
      expect(res.status).toBe(403);
      expect(text).not.toContain(SECRET);
    });
  }

  it("user B cannot rename, archive or delete thread A", async () => {
    for (const [path, httpMethod] of [
      [`/api/copilotkit/threads/${threadA}`, "PATCH"],
      [`/api/copilotkit/threads/${threadA}`, "DELETE"],
      [`/api/copilotkit/threads/${threadA}/archive`, "POST"],
    ] as const) {
      const res = await resource(path, httpMethod, { name: "hijacked" });
      expect(res.status, `${httpMethod} ${path}`).toBe(403);
    }
  });

  it("user B cannot wipe the process's threads, and thread A survives", async () => {
    const res = await resource("/api/copilotkit/threads/clear", "POST");
    expect(res.status).toBe(403);

    // A's conversation is still there: A reconnecting replays the secret.
    signInAs("user-a");
    const replay = await post({
      method: "agent/connect",
      params: { agentId: "conciergeAgent" },
      body: { threadId: threadA, runId: crypto.randomUUID(), messages: [], tools: [], context: [], state: {}, forwardedProps: {} },
    });
    expect(replay.status).toBe(200);
    expect(await replay.text()).toContain(SECRET);
  });

  it("the owner cannot use them either: MDE serves its own thread list", async () => {
    // Fail-closed allowlist: MDE's sidebar uses /api/threads, not these
    // routes. Owner-scoped history reads are a deliberate future addition.
    signInAs("user-a");
    const res = await resource(`/api/copilotkit/threads/${threadA}/messages`);
    expect(res.status).toBe(403);
  });

  it("the routes MDE does use still work for a signed-in user", async () => {
    const info = await post({ method: "info" });
    expect(info.status).toBe(200);
    expect(await info.json()).toHaveProperty("agents.conciergeAgent");

    // User B can still chat on a thread of their own.
    const res = await post({
      method: "agent/run",
      params: { agentId: "conciergeAgent" },
      body: {
        threadId: crypto.randomUUID(),
        runId: crypto.randomUUID(),
        messages: [{ id: crypto.randomUUID(), role: "user", content: "hello" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      },
    });
    expect(res.status).toBe(200);
  });
});
