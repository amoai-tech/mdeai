import { expect, test } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "./helpers/auth";
import {
  gotoConcierge,
  sendConciergeMessage,
  waitForCopilotIdle,
} from "./helpers/maps-layout";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";

/**
 * SAN-1445: real /chat send pipeline, not a direct hook test.
 *
 * Opt-in against an explicit production or candidate URL. Requires real disposable
 * Supabase QA credentials. No secrets, screenshots or auth-state artifacts are saved.
 * Run with PROD_SMOKE_BASE_URL=https://www.mdeai.co PW_SKIP_WEBSERVER=1.
 */
const base = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const isPreview = base ? new URL(base).hostname.endsWith(".vercel.app") : false;

test.use({ channel: "chrome", viewport: { width: 390, height: 844 }, trace: "off", screenshot: "off", video: "off" });

test.describe("SAN-1445 — explicit furnishing clear survives Concierge and saved chats", () => {
  test.skip(!base, "Set an explicit PROD_SMOKE_BASE_URL for signed-in regression.");

  let identity: ThrowawayIdentity | undefined;

  test.beforeAll(async () => {
    expect(hasE2eEnv(), "Real Supabase QA credentials required").toBe(true);
    identity = await createThrowawayIdentity("qa-san1445-clear");
  });

  test.afterAll(async () => {
    if (identity) await deleteThrowawayIdentity(identity);
  });

  test("honors latest furnishing decisions through budget edits, agent reply and reload", async ({ page }) => {
    test.setTimeout(360_000);
    await signInAsOnOrigin(page, base, identity!.email);
    if (isPreview) {
      await establishVercelAutomationBypass(page, base, process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "");
    }

    const searches: Array<{ status: number; body: Record<string, unknown> }> = [];
    page.on("response", (response) => {
      if (new URL(response.url()).pathname !== "/api/rentals/search") return;
      const request = response.request();
      if (request.method() !== "POST") return;
      try {
        searches.push({
          status: response.status(),
          body: request.postDataJSON() as Record<string, unknown>,
        });
      } catch {
        // Invalid JSON is independently an assertion failure (missing request).
      }
    });

    await gotoConcierge(page);
    const ask = async (message: string) => {
      await sendConciergeMessage(page, message);
      await waitForCopilotIdle(page);
    };
    const search = async (message: string, price: number, furnishing: boolean | undefined) => {
      const before = searches.length;
      await ask(message);
      await expect.poll(() => searches.length, { timeout: 40_000 }).toBeGreaterThan(before);
      const actual = searches.at(-1)!;
      expect(actual.status).toBe(200);
      expect(actual.body).toMatchObject({
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxBedrooms: 2,
        maxPriceMonthly: price,
        budgetCurrency: "COP",
      });
      expect(actual.body.furnished).toBe(furnishing);
    };

    await search("Find furnished 2-bedroom apartments in Laureles under COP 3 million", 3_000_000, true);
    await search("Only under COP 2.5 million", 2_500_000, true);
    const countBeforeClear = searches.length;
    await ask("Either furnished or unfurnished is fine");
    expect(searches.length, "clearing without new criteria should not run a second search").toBe(countBeforeClear);
    await search("Only under COP 2.4 million", 2_400_000, undefined);

    await page.reload({ waitUntil: "domcontentloaded" });
    await search("Only under COP 2.3 million", 2_300_000, undefined);
    await search("Actually show unfurnished apartments", 2_300_000, false);
  });
});
