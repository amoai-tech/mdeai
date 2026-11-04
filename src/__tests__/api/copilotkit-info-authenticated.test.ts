import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SAN-1357 Step 10 · authenticated single-route `/info` through the REAL route.
 *
 * Only the edges that need a network are faked: the Supabase session lookup and
 * the distributed rate limiter. Everything that decides the answer is real — the
 * route's auth gate and thread resolution, the v2 `createCopilotRuntimeHandler` in
 * single-route mode, the Mastra instance, and the runtime agent allowlist. So
 * this fails if the transport pair, the agent graph or the auth ordering regresses.
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

import { POST } from "@/app/api/copilotkit/[[...path]]/route";

const CANONICAL_AGENTS = ["pingAgent", "conciergeAgent", "hostEventAgent", "hostOpsAgent"];

const pinnedRuntimeVersion = (
  JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  }
).dependencies["@copilotkit/runtime"];

/** The exact envelope the pinned client sends with `useSingleEndpoint: true`. */
const infoEnvelope = () =>
  new Request("http://localhost/api/copilotkit", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({ method: "info" }),
  }) as never;

describe("Step 10 · authenticated single-route /info (real route + real agent graph)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT;
    process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";
    getUserMock.mockReset();
  });

  it("returns 200 with the pinned runtime version and the four canonical MDE agents", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "info-proof-user" } } });

    const response = await POST(infoEnvelope());
    const body = (await response.json()) as {
      version?: string;
      agents?: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type") ?? "").toContain("application/json");
    expect(pinnedRuntimeVersion).toBe("1.75.0");
    expect(body.version).toBe(pinnedRuntimeVersion);
    expect(CANONICAL_AGENTS.filter((name) => !body.agents?.[name])).toEqual([]);
  });

  it("rejects the same envelope without a session, before the runtime lists any agent", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await POST(infoEnvelope());
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).toContain("unauthorized");
    expect(text).not.toContain('"agents"');
  });
});
