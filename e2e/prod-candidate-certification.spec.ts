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
import { assertRunCompleted, runConciergeAgent } from "./helpers/agui-concierge";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";

const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";
const enabled = Boolean(baseUrl);
if (process.env.CI && !baseUrl) {
  throw new Error("PROD_SMOKE_BASE_URL is required in CI for candidate certification");
}
const route = (path: string) => new URL(path, `${baseUrl}/`).toString();

/**
 * Count persisted AG-UI/Mastra threads.
 *
 * With `threadId`, this is a durability proof for one exact thread: `mastra_threads.id`
 * IS the AG-UI threadId (Mastra's own `getThreadById` queries `WHERE id = $1`), and
 * `resourceId` is the server-derived owner. Without it, this counts every thread a
 * resource owns, which is what the cleanup assertion needs.
 */
async function threadCount(resourceId: string, threadId?: string): Promise<number> {
  const admin = await getSupabaseAdmin();
  let query = admin
    .from("mastra_threads")
    .select("id", { count: "exact", head: true })
    .eq("resourceId", resourceId);
  if (threadId !== undefined) query = query.eq("id", threadId);
  const { count, error } = await query;
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

      // Non-vacuity guard for the persistence assertion below. The threadId is a
      // fresh UUID, so this exact thread cannot exist yet. Asserting that NOW is
      // what makes the later `toBeGreaterThan(0)` mean something: it proves the
      // counter discriminates, so the run itself must be what created the row —
      // the check cannot pass on a leftover thread, and cannot pass if the server
      // echoes correct ids but never persists anything.
      expect(
        await threadCount(identity!.userId, threadId),
        "a fresh threadId must not already exist",
      ).toBe(0);

      // The route authorizes with a server-side `auth.getUser()`, so the
      // injected Supabase session must travel as cookies. Only cookies for this
      // exact origin are forwarded.
      const cookies = await page.context().cookies(route("/"));
      const cookieHeader = cookies
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");

      const { events, threadId: sentThreadId, runId } = await runConciergeAgent({
        url: route("/api/copilotkit"),
        threadId,
        headers: { Cookie: cookieHeader },
      });

      // Tie the wire request to the thread we chose, so the identity check below
      // and the durability assertion both name the same, intended thread.
      expect(sentThreadId).toBe(threadId);

      // Requires RUN_STARTED, no RUN_ERROR, and RUN_FINISHED — and that those
      // lifecycle events carry the threadId WE ASKED FOR and the runId this
      // request generated. A bare 200 would not: the AG-UI handler ALWAYS answers
      // 200 with `text/event-stream`, and a failed run is signalled by the stream
      // closing without RUN_FINISHED. Identity matters too, or a completed stream
      // for another thread/run would certify a turn that never happened.
      assertRunCompleted(events, { threadId, runId });

      // Separate durability assertion, and it names the EXACT thread: the
      // completed turn was persisted under the throwaway user AND under the
      // threadId we requested. Counting any thread for the user would pass even
      // if this turn had been written somewhere else.
      await expect
        .poll(() => threadCount(identity!.userId, sentThreadId), { timeout: 90_000 })
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
