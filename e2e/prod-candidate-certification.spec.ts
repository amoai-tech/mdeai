import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "./helpers/auth";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";

const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";
const enabled = Boolean(baseUrl);
if (process.env.CI && !baseUrl) {
  throw new Error("PROD_SMOKE_BASE_URL is required in CI for candidate certification");
}
const route = (path: string) => new URL(path, `${baseUrl}/`).toString();

function conciergeRunBody(threadId: string) {
  return {
    // `agent/run`, NOT `agent/connect`. handleConnectAgent only opens an SSE
    // stream for the thread: parseConnectRequest validates the SAME
    // RunAgentInputSchema, so `messages` is accepted and then silently dropped,
    // and the agent never runs. Only handleRunAgent does
    // agent.setMessages(input.messages) and dispatches the turn. With
    // `agent/connect` this certification could return 200 and persist a thread
    // without `ping` ever being processed.
    method: "agent/run",
    params: { agentId: "conciergeAgent" },
    body: {
      threadId,
      runId: randomUUID(),
      messages: [{ id: randomUUID(), role: "user", content: "ping" }],
      tools: [],
      context: [],
      state: {},
    },
  };
}

async function threadCount(resourceId: string): Promise<number> {
  const admin = await getSupabaseAdmin();
  const { count, error } = await admin
    .from("mastra_threads")
    .select("id", { count: "exact", head: true })
    .eq("resourceId", resourceId);
  if (error) throw new Error(`mastra_threads count failed: ${error.message}`);
  return count ?? 0;
}

test.describe("SAN-1330 staged production candidate certification", () => {
  test.skip(!enabled, "Set PROD_SMOKE_BASE_URL to the exact staged Vercel deployment URL");

  test("proves public pages, auth, CopilotKit runtime, one durable turn, and cleanup", async ({ page }) => {
    test.setTimeout(300_000);
    expect(bypassSecret, "VERCEL_AUTOMATION_BYPASS_SECRET is required").not.toBe("");
    expect(hasE2eEnv(), "Supabase QA credentials are required for candidate certification").toBe(true);

    await establishVercelAutomationBypass(page, baseUrl, bypassSecret);

    for (const path of ["/", "/events"]) {
      const response = await page.goto(route(path), { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${path} status`).toBe(200);
      await expect(page.locator("body")).toBeVisible();
    }

    for (const method of ["get", "post"] as const) {
      const response = await page.request[method](route("/api/copilotkit/info"),
        method === "post" ? { data: { method: "info" } } : undefined,
      );
      expect(response.status(), `unauthenticated ${method.toUpperCase()} runtime info`).toBe(401);
      expect(await response.text()).not.toContain('"agents"');
    }

    let identity: ThrowawayIdentity | undefined;
    try {
      identity = await createThrowawayIdentity("qa-san1330");
      await signInAsOnOrigin(page, baseUrl, identity.email);
      // Supabase session injection clears cookies, so re-establish only the same-origin
      // Vercel bypass cookie afterwards. The secret itself is never globally attached.
      await establishVercelAutomationBypass(page, baseUrl, bypassSecret);

      const saved = await page.goto(route("/saved"), { waitUntil: "domcontentloaded" });
      expect(saved?.status()).toBe(200);
      expect(page.url()).not.toContain("/login");

      const infoResponse = await page.request.post(route("/api/copilotkit/info"), {
        data: { method: "info" },
      });
      expect(infoResponse.status()).toBe(200);
      const info = (await infoResponse.json()) as {
        version?: string;
        agents?: Record<string, unknown>;
      };
      const pinned = (
        JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
          dependencies: Record<string, string>;
        }
      ).dependencies["@copilotkit/runtime"];
      expect(info.version).toBe(pinned);
      const expectedAgents = ["pingAgent", "conciergeAgent", "hostEventAgent", "hostOpsAgent"];
      expect(expectedAgents.filter((name) => !info.agents?.[name])).toEqual([]);

      // The unique Vercel deployment hostname is intentionally not authorized for the
      // production Maps browser key. Certify the AI path directly here; the deeper
      // post-promotion smoke validates Maps and the full /chat UI on mdeai.co.
      const threadId = `san1330-${randomUUID()}`;
      const runResponse = await page.request.post(route("/api/copilotkit"), {
        data: conciergeRunBody(threadId),
        timeout: 120_000,
      });
      expect(runResponse.status(), "authenticated concierge agent/run").toBe(200);
      await expect
        .poll(() => threadCount(identity!.userId), { timeout: 90_000 })
        .toBeGreaterThan(0);
    } finally {
      if (identity) {
        const userId = identity.userId;
        await deleteThrowawayIdentity(identity);
        await expect.poll(() => threadCount(userId), { timeout: 30_000 }).toBe(0);
      }
    }
  });
});
