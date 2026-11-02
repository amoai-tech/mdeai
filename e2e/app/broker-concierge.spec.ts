import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
} from "../helpers/auth";

/**
 * SAN-1124 — Opt-in real CopilotKit/Mastra run against an RLS-scoped broker.
 * Uses a throwaway identity and real Supabase Auth, not a fake chat reply.
 * Never runs in the ordinary PR browser lane.
 */
test.describe("SAN-1124 live broker AI", () => {
  test.setTimeout(180_000);
  test.skip(
    !hasE2eEnv() || process.env.MDE_BROKER_AI_LIVE !== "1",
    "Requires explicit MDE_BROKER_AI_LIVE=1 and Supabase E2E env",
  );

  test("broker asks for their own viewing requests and receives a real answer", async ({
    page,
    baseURL,
  }) => {
    const identity = await createThrowawayIdentity("san1124-broker-ai");
    const admin = await getSupabaseAdmin();
    try {
      const { error: insertError } = await admin.from("landlord_profiles").insert({
        user_id: identity.userId,
        display_name: "SAN-1124 AI TEST broker",
      });
      expect(insertError).toBeNull();
      await signInAsOnOrigin(page, baseURL ?? "http://localhost:3001", identity.email);

      page.on("console", (message) => {
        if (message.type() === "error") console.log("BROKER_BROWSER_ERROR", message.text().slice(0, 300));
      });
      page.on("pageerror", (err) => console.log("BROKER_PAGE_ERROR", err.message.slice(0, 300)));
      page.on("response", async (response) => {
        if (!response.url().includes("/api/copilotkit")) return;
        const request = response.request();
        let method = "unknown";
        try { method = (request.postDataJSON() as {method?: string}).method ?? "unknown"; } catch {}
        console.log("BROKER_COPILOT_HTTP", method, response.status());
        if (method === "info") {
          try {
            const payload = await response.json() as {agents?: Record<string, unknown>};
            console.log("BROKER_AVAILABLE_AGENT_IDS", Object.keys(payload.agents ?? {}).join(","));
          } catch {}
        }
      });
      let runs = 0;
      page.on("request", (request) => {
        if (!request.url().includes("/api/copilotkit") || request.method() !== "POST") return;
        try {
          const body = request.postDataJSON() as { method?: string };
          if (body.method === "agent/run") runs += 1;
        } catch {
          // The runtime request is inspected in the browser test, not recorded.
        }
      });

      await page.goto("/app/rentals");
      const center = page.getByTestId("rc-center");
      await expect(center.getByRole("heading", { name: "Your rentals, run by AI" })).toBeVisible();
      const input = center.getByPlaceholder("Ask about your listings, leads or viewings…");
      await expect(input).toBeEditable({ timeout: 45_000 });
      await input.fill("Which viewing requests need my attention? Report only my saved requests.");
      const send = center.locator("button").last();
      await expect(send).toBeEnabled({ timeout: 45_000 });
      await send.click();
      await expect.poll(() => runs, { timeout: 20_000 }).toBeGreaterThan(0);

      // The separate broker has no viewings. The answer must not invent any.
      await expect(center.getByText(/(no|none|haven.t|don.t).*?(viewing|requests)/i).last())
        .toBeVisible({ timeout: 90_000 });
      expect(runs, "must send a real AG-UI agent/run, not a local fake").toBeGreaterThan(0);

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(center).toBeVisible();
      await expect(input).toBeVisible();
      await page.screenshot({ path: "test-results/san1124-broker-ai-success.png", fullPage: true });
    } finally {
      const cleanupErrors: string[] = [];
      const { error: removeProfile } = await admin.from("landlord_profiles")
        .delete().eq("user_id", identity.userId);
      if (removeProfile) cleanupErrors.push(removeProfile.message);
      try { await deleteThrowawayIdentity(identity); }
      catch (err) { cleanupErrors.push(String(err)); }
      const { count, error } = await admin.from("landlord_profiles")
        .select("id", { count: "exact", head: true }).eq("user_id", identity.userId);
      if (error) cleanupErrors.push(error.message);
      if (count !== 0) cleanupErrors.push(`Broker profile residue: ${count}`);
      expect(cleanupErrors).toEqual([]);
    }
  });
});
