import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";
import {
  createThrowawayIdentity, deleteThrowawayIdentity,
  hasE2eEnv, signInAsOnOrigin, type ThrowawayIdentity,
} from "./helpers/auth";

const base = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const evidence = process.env.MDE_QA_EVIDENCE_DIR?.trim();
const isPreview = base ? new URL(base).hostname.endsWith(".vercel.app") : false;

test.use({
  channel: "chrome", viewport: { width: 1440, height: 900 },
  trace: "retain-on-failure", screenshot: "only-on-failure",
});
test.describe("SAN-1390 — four signed-in discovery journeys on the real concierge", () => {
  test.skip(!base, "Explicit target URL required");
  let identity: ThrowawayIdentity | undefined;
  test.beforeAll(async () => {
    expect(hasE2eEnv()).toBe(true);
    identity = await createThrowawayIdentity("qa-san1390-five-pages");
  });
  test.afterAll(async () => {
    if (identity) await deleteThrowawayIdentity(identity);
  });

  for (const scenario of [
    { route: "restaurants", queries: ["Italian restaurants in El Poblado", "Only affordable ones"] },
    { route: "events", queries: ["Find music events this weekend", "Only in El Poblado"] },
    { route: "cafes", queries: ["Quiet cafes for remote work in Laureles", "Only in Laureles"] },
    { route: "nightlife", queries: ["Find salsa clubs near Provenza", "Only with live salsa"] },
  ]) {
    test(scenario.route + " keeps two AI turns and grounded browse results", async ({ page }) => {
      test.setTimeout(240_000);
      const email = identity?.email;
      if (!email) throw new Error("QA identity was not created");
      await signInAsOnOrigin(page, base, email);
      if (isPreview) await establishVercelAutomationBypass(page, base, process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "");
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));
      const responses: number[] = [];
      page.on("response", (r) => {
        if (r.url().includes("/api/copilotkit") && r.request().method() === "POST") {
          responses.push(r.status());
        }
      });
      await page.goto(new URL("/" + scenario.route, base).toString(), { waitUntil: "domcontentloaded" });
      const input = page.getByTestId("discovery-ask-input");
      const send = page.getByTestId("discovery-ask-send");
      let index = 0;
      for (const question of scenario.queries) {
        await expect(input).toBeVisible({ timeout: 45_000 });
        await input.fill(question);
        await expect(send).toBeEnabled({ timeout: 45_000 });
        await send.click();
        await expect(page.getByTestId("discovery-ask-history")).toContainText(question, { timeout: 110_000 });
        // Every user turn must finish with an actual assistant text response.
        await expect.poll(async () => page.getByTestId("discovery-ask-history").locator("li")
          .evaluateAll((els) => els.filter((el) => {
            const text = el.textContent?.trim() ?? "";
            return text.startsWith("MDE:") && text.length > 4;
          }).length), { timeout: 110_000 }).toBeGreaterThan(index);
        index++;
      }
      for (const query of scenario.queries) {
        await expect(page.getByTestId("discovery-ask-history")).toContainText(query);
      }
      expect(failures).toEqual([]);
      expect(responses.some((code) => code === 200)).toBe(true);
      expect(responses.some((code) => code >= 400 && code !== 401)).toBe(false);
      // The browser sees only real tool outputs: a no-match result is acceptable,
      // but a search that yielded no tool result cannot be called a verified cards journey.
      if (scenario.route === "cafes" || scenario.route === "nightlife") {
        await expect(page.getByTestId("discovery-grounded-results")).toBeVisible({ timeout: 15_000 });
      }
      if (scenario.route === "events") {
        // A truthful empty state is valid; assistant text without a resolved
        // catalog state is not a verified event discovery journey.
        await expect(page.getByTestId("guest-event-results-count").or(page.getByTestId("events-empty")).first())
          .toBeVisible({ timeout: 15_000 });
      }
      if (scenario.route === "restaurants") {
        await expect(page.getByTestId("restaurants-grid")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("restaurants-browse")).toContainText("Ask MDE —", { timeout: 15_000 });
      }
      if (evidence) {
        await mkdir(evidence, { recursive: true });
        await page.screenshot({ path: join(evidence, scenario.route + "-two-turn-1440.png"), fullPage: true });
      }
    });
  }
});
