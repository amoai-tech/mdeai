import { expect, test } from "./fixtures";
import { loadEnvLocalForE2E } from "./helpers/auth";
import {
  gotoConcierge,
  sendConciergeMessage,
  waitForCopilotIdle,
} from "./helpers/maps-layout";
import { validateMdeAuthenticatedQaOrigin } from "./fixtures/vercel-bypass";

/**
 * SAN-1445: real /chat send pipeline, not a direct hook test.
 *
 * Opt-in against verified MDE production/candidate URL with the existing dedicated
 * passwordless renter QA account. No account creation and no auth artifacts.
 * Run with PROD_SMOKE_BASE_URL=https://www.mdeai.co PW_SKIP_WEBSERVER=1.
 */
// Same ignored QA configuration loader as other existing renter journeys.
loadEnvLocalForE2E();
const rawBase = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
// Playwright test discovery must remain side-effect free even when other
// suites pass synthetic remote URLs. beforeAll runs before the test-scoped
// qaRolePage fixture can inject an authenticated user session.
const base = rawBase;

test.use({ qaRole: "renter", channel: "chrome", viewport: { width: 390, height: 844 }, trace: "off", screenshot: "off", video: "off" });

test.describe("SAN-1445 — explicit furnishing clear survives Concierge and saved chats", () => {
  test.skip(!base, "Set an explicit PROD_SMOKE_BASE_URL for signed-in regression.");
  test.beforeAll(() => {
    validateMdeAuthenticatedQaOrigin(base);
  });

  test("honors latest furnishing decisions through budget edits, agent reply and reload", async ({ qaRolePage: page }) => {
    test.setTimeout(360_000);
    // qaRolePage signs in as EXISTING renter with requireExisting=true.
    // This spec validates its target before fixture initialization.

    const searches: Array<{ status: number; body: Record<string, unknown> }> = [];
    let searchRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/rentals/search" && request.method() === "POST") {
        searchRequests += 1;
      }
    });
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
    const countBeforeClear = searchRequests;
    await ask("Either furnished or unfurnished is fine");
    // Count REQUEST events, not only completed responses; an in-flight extra
    // search must not pass this assertion by responding after the check.
    await page.waitForTimeout(1_200);
    expect(searchRequests, "clearing without new criteria must not issue a hidden search").toBe(countBeforeClear);
    await search("Only under COP 2.4 million", 2_400_000, undefined);

    await page.reload({ waitUntil: "domcontentloaded" });
    await search("Only under COP 2.3 million", 2_300_000, undefined);
    await search("Actually show unfurnished apartments", 2_300_000, false);
  });
});
