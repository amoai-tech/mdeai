import { beforeEach, describe, expect, it, vi } from "vitest";

const handleRequestMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const ipHardCeilingMock = vi.hoisted(() => vi.fn());
const distributedRateLimitMock = vi.hoisted(() => vi.fn());
// Explicit signatures: the inferred `null` / `{ kind: string }` shapes would
// reject the Response and thread-kind values the tests return.
const assertAuthorizedMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Response | null>(() => null),
);
const resolveRequestedThreadMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ kind: "none" })),
);

vi.mock("@copilotkit/runtime", () => ({
  CopilotRuntime: vi.fn(function CopilotRuntime() {
    return {};
  }),
  ExperimentalEmptyAdapter: vi.fn(function ExperimentalEmptyAdapter() {
    return {};
  }),
  copilotRuntimeNextJSAppRouterEndpoint: vi.fn(() => ({
    handleRequest: handleRequestMock,
  })),
}));

vi.mock("@/mastra", () => ({ mastra: {} }));
vi.mock("@/mastra/copilotkit/logging-mastra-agent", () => ({
  getLocalAgentsWithLogging: vi.fn(() => ({})),
}));
vi.mock("@/mastra/lib/log-agent-run", () => ({ logAgentRunForTurn: vi.fn() }));
vi.mock("@/lib/copilotkit-auth", () => ({
  assertCopilotKitAuthorized: assertAuthorizedMock,
}));
vi.mock("@/lib/copilotkit-thread-ownership", () => ({
  resolveRequestedThread: resolveRequestedThreadMock,
}));
vi.mock("@/lib/copilotkit-distributed-rate-limit", () => ({
  checkCopilotKitDistributedIpHardCeiling: (...args: unknown[]) => ipHardCeilingMock(...args),
  checkCopilotKitDistributedRateLimit: (...args: unknown[]) =>
    distributedRateLimitMock(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

import { GET, POST } from "@/app/api/copilotkit/[[...path]]/route";

function getInfoRequest(ip = "203.0.113.60"): Request {
  return new Request("http://localhost/api/copilotkit/info", {
    method: "GET",
    headers: { "x-forwarded-for": ip },
  });
}

function postRequest(ip: string, body = ""): Request {
  return new Request("http://localhost/api/copilotkit", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      "content-type": "application/json",
    },
    body,
  });
}

/** Reset every mock to its passing default. Shared by both suites. */
function setupStandardMocks() {
  delete process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT;
  handleRequestMock.mockReset();
  getUserMock.mockReset();
  ipHardCeilingMock.mockReset();
  distributedRateLimitMock.mockReset();
  assertAuthorizedMock.mockReset();
  resolveRequestedThreadMock.mockReset();

  assertAuthorizedMock.mockReturnValue(null);
  resolveRequestedThreadMock.mockResolvedValue({ kind: "none" });
  ipHardCeilingMock.mockResolvedValue(null);
  distributedRateLimitMock.mockResolvedValue(null);
  getUserMock.mockResolvedValue({ data: { user: null } });
  handleRequestMock.mockResolvedValue(new Response("bad request", { status: 400 }));
}

describe("POST /api/copilotkit — distributed rate limit gate", () => {
  beforeEach(setupStandardMocks);

  it("returns local runtime info before auth/rate limits in deterministic E2E", async () => {
    process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT = "1";

    const res = await GET(getInfoRequest() as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ agents: {} });
    expect(ipHardCeilingMock).not.toHaveBeenCalled();
    expect(distributedRateLimitMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
    expect(handleRequestMock).not.toHaveBeenCalled();
  });

  it("does not call Mastra runtime when distributed rate limit blocks", async () => {
    distributedRateLimitMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate_limited", retryAfter: 120 }), {
        status: 429,
      }),
    );

    const res = await POST(postRequest("186.81.102.183") as never);
    expect(res.status).toBe(429);
    expect(handleRequestMock).not.toHaveBeenCalled();
  });

  it("passes through to runtime when under limit (empty body keeps 400 behavior)", async () => {
    const res = await POST(postRequest("203.0.113.60") as never);
    expect(res.status).toBe(400);
    expect(handleRequestMock).toHaveBeenCalledTimes(1);
    expect(ipHardCeilingMock.mock.invocationCallOrder[0]).toBeLessThan(
      distributedRateLimitMock.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("blocks at IP hard ceiling before Supabase getUser", async () => {
    ipHardCeilingMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate_limited", retryAfter: 300 }), {
        status: 429,
      }),
    );

    const res = await POST(postRequest("186.81.102.183") as never);
    expect(res.status).toBe(429);
    expect(getUserMock).not.toHaveBeenCalled();
    expect(handleRequestMock).not.toHaveBeenCalled();
  });

  it("returns 500 when hard-ceiling check throws inside try/catch", async () => {
    ipHardCeilingMock.mockRejectedValueOnce(new Error("rpc exploded"));

    const res = await POST(postRequest("186.81.102.183") as never);
    expect(res.status).toBe(500);
    expect(getUserMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/copilotkit — authorization runs before agent execution (SAN-1358 · D20)", () => {
  beforeEach(() => {
    setupStandardMocks();
    // This suite needs an allowed request to reach the runtime by default.
    handleRequestMock.mockResolvedValue(new Response("ok", { status: 200 }));
  });

  it("resolves ownership from server-derived identity before authorizing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-a" } } });
    resolveRequestedThreadMock.mockResolvedValue({
      kind: "existing",
      threadId: "t1",
      resourceId: "user-a",
    });

    await POST(postRequest("203.0.113.61", JSON.stringify({ threadId: "t1" })) as never);

    // Identity must be established before the authorization decision is taken.
    const getUserOrder = getUserMock.mock.invocationCallOrder[0]!;
    const authorizeOrder = assertAuthorizedMock.mock.invocationCallOrder[0]!;
    const handleOrder = handleRequestMock.mock.invocationCallOrder[0]!;
    expect(getUserOrder).toBeLessThan(authorizeOrder);
    expect(authorizeOrder).toBeLessThan(handleOrder);
  });

  it("passes the resolved thread owner into the auth decision", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-a" } } });
    const thread = { kind: "existing" as const, threadId: "t1", resourceId: "user-b" };
    resolveRequestedThreadMock.mockResolvedValue(thread);

    await POST(postRequest("203.0.113.62", JSON.stringify({ threadId: "t1" })) as never);

    expect(assertAuthorizedMock).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "user-a", thread },
    );
  });

  it("rejected authorization never reaches the CopilotKit handler", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-a" } } });
    resolveRequestedThreadMock.mockResolvedValue({
      kind: "existing",
      threadId: "t1",
      resourceId: "user-b",
    });
    assertAuthorizedMock.mockReturnValue(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 403 }),
    );

    const res = await POST(postRequest("203.0.113.63", JSON.stringify({ threadId: "t1" })) as never);

    expect(res.status).toBe(403);
    expect(handleRequestMock).not.toHaveBeenCalled();
    expect(distributedRateLimitMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated foreign request before the handler", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    assertAuthorizedMock.mockReturnValue(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );

    const res = await POST(postRequest("203.0.113.64") as never);

    expect(res.status).toBe(401);
    expect(handleRequestMock).not.toHaveBeenCalled();
  });

  it("still reaches the runtime once for an allowed authenticated request", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-a" } } });
    resolveRequestedThreadMock.mockResolvedValue({ kind: "new", threadId: "t-new" });

    const res = await POST(postRequest("203.0.113.65", JSON.stringify({ threadId: "t-new" })) as never);

    expect(res.status).toBe(200);
    expect(handleRequestMock).toHaveBeenCalledTimes(1);
    expect(distributedRateLimitMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed with 500 when thread ownership cannot be verified", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-a" } } });
    resolveRequestedThreadMock.mockRejectedValueOnce(new Error("service role client unavailable"));

    const res = await POST(postRequest("203.0.113.66", JSON.stringify({ threadId: "t1" })) as never);

    expect(res.status).toBe(500);
    expect(handleRequestMock).not.toHaveBeenCalled();
  });
});
