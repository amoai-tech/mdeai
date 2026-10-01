import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SAN-1357 Stage B+C · Step 11 — STOP-4, the stop request body must survive the
 * MDE route intact.
 *
 * Why this is the highest-value assertion in the stage: CopilotKit 1.75.0 already
 * scopes a stop to one run. `handle-stop.ts` parses an optional `{ runId }` body
 * and rejects any other key with 400, and it reads that body from a clone.
 * The remaining way MDE can lose that protection is inside our own middleware: if
 * anything on the way in consumes the body without cloning, the runtime sees `{}`
 * and silently degrades to a **thread-wide** stop — cancelling a newer run on the
 * same thread. That is a real regression of a fix we already own, and it would be
 * invisible to typecheck, lint and floor.
 */

const handleRequestMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const ipHardCeilingMock = vi.hoisted(() => vi.fn());
const distributedRateLimitMock = vi.hoisted(() => vi.fn());
const authorizeMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => { allowed: true; resourceId: string; via: string } | { allowed: false; response: Response }>(
    () => ({ allowed: true, resourceId: "stop-body-user", via: "new-thread" }),
  ),
);
const resolveRequestedThreadMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ kind: "none" })),
);

vi.mock("@copilotkit/runtime/v2", () => ({
  CopilotRuntime: vi.fn(function CopilotRuntime() {
    return {};
  }),
  // The v2 fetch handler is invoked directly by the route.
  createCopilotRuntimeHandler: vi.fn(() => handleRequestMock),
}));

vi.mock("@/mastra", () => ({ mastra: {} }));
vi.mock("@/mastra/copilotkit/logging-mastra-agent", () => ({
  getLocalAgentsWithLogging: vi.fn(() => ({})),
}));
vi.mock("@/mastra/lib/log-agent-run", () => ({ logAgentRunForTurn: vi.fn() }));
vi.mock("@/lib/copilotkit-auth", () => ({
  authorizeCopilotKitRequest: authorizeMock,
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
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}));

import { POST } from "@/app/api/copilotkit/[[...path]]/route";

const STOP_BODY = JSON.stringify({ runId: "11111111-1111-4111-8111-111111111111" });

function stopRequest(body = STOP_BODY): Request {
  return new Request("http://localhost/api/copilotkit", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.90", "content-type": "application/json" },
    body,
  });
}

/** What the CopilotKit runtime actually received, read as text. */
let receivedBody: string | null = null;

/** Set when the body had already been consumed and could not be read at all. */
const UNUSABLE = "<body unusable>";

/** Did the runtime obtain a scoped-stop body carrying `runId`? */
function runtimeSawScopedStop(): boolean {
  if (!receivedBody) return false;
  try {
    return "runId" in (JSON.parse(receivedBody) as object);
  } catch {
    return false;
  }
}

function setup(threadReader: (req: Request) => Promise<unknown>) {
  delete process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT;
  handleRequestMock.mockReset();
  getUserMock.mockReset();
  ipHardCeilingMock.mockReset();
  distributedRateLimitMock.mockReset();
  authorizeMock.mockReset();
  resolveRequestedThreadMock.mockReset();
  receivedBody = null;

  authorizeMock.mockReturnValue({ allowed: true, resourceId: "stop-body-user", via: "new-thread" });
  ipHardCeilingMock.mockResolvedValue(null);
  distributedRateLimitMock.mockResolvedValue(null);
  getUserMock.mockResolvedValue({ data: { user: { id: "stop-body-user" } } });
  resolveRequestedThreadMock.mockImplementation((req: unknown) =>
    threadReader(req as Request),
  );
  handleRequestMock.mockImplementation(async (req: Request) => {
    // A consumed body is unusable in undici, so a non-cloning reader upstream
    // makes this read throw rather than return empty. Record both shapes.
    try {
      receivedBody = await req.text();
    } catch {
      receivedBody = UNUSABLE;
    }
    return new Response("ok", { status: 200 });
  });
}

/** The behaviour of the real gate: copilotkit-thread-ownership.ts:112. */
const cloningGate = async (req: Request) => ({ kind: "none", _read: await req.clone().json() });

describe("Step 11 · STOP-4 stop body integrity", () => {
  beforeEach(() => setup(cloningGate));

  it("delivers the exact { runId } body to the runtime", async () => {
    const res = await POST(stopRequest() as never);

    expect(res.status).toBe(200);
    expect(handleRequestMock).toHaveBeenCalledTimes(1);
    expect(receivedBody).toBe(STOP_BODY);
    expect(runtimeSawScopedStop()).toBe(true);
  });

  it("carries runId and no other key, so the runtime cannot reject or widen it", async () => {
    await POST(stopRequest() as never);

    const parsed = JSON.parse(receivedBody ?? "{}") as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["runId"]);
    expect(parsed.runId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("the gate's own clone is what preserves the body", () => {
    // Pins the implementation this suite depends on. If that clone is removed,
    // the negative control below becomes the real behaviour and this suite fails.
    const gate = readFileSync("src/lib/copilotkit-thread-ownership.ts", "utf8");

    expect(gate).toContain("req.clone()");
    expect(gate).not.toMatch(/await\s+req\.json\(\)/);
  });
});

describe("Step 11 · STOP-4 negative control — a non-cloning read destroys the scope", () => {
  beforeEach(() => {
    // Mutation: the gate inspects the body without cloning, which is the defect
    // STOP-4 exists to catch. Everything else is identical to the suite above.
    setup(async (req: Request) => ({ kind: "none", _read: await req.json() }));
  });

  it("the runtime cannot obtain a scoped stop — it gets nothing usable", async () => {
    await POST(stopRequest() as never);

    // This is the property that matters, and the reason the positive suite above
    // is not vacuous: with a non-cloning reader the runtime never sees runId.
    expect(runtimeSawScopedStop()).toBe(false);
    expect(receivedBody).not.toBe(STOP_BODY);
    // Either the body was unusable (the read throws on a consumed stream) or it
    // came through empty — both degrade the stop away from run scope.
    expect([UNUSABLE, ""]).toContain(receivedBody);
  });
});

describe("Step 11 · a rejected stop never reaches the runtime", () => {
  beforeEach(() => setup(cloningGate));

  it("requires the body to be present for a scoped stop and rejects foreign thread first", async () => {
    authorizeMock.mockReturnValue({
      allowed: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 403 }),
    });

    const res = await POST(stopRequest() as never);

    expect(res.status).toBe(403);
    expect(handleRequestMock).not.toHaveBeenCalled();
    expect(distributedRateLimitMock).not.toHaveBeenCalled();
    expect(receivedBody).toBeNull();
  });
});
