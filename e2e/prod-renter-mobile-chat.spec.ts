import { test, expect } from "@playwright/test";
import { hasE2eEnv, signInAsOnOrigin } from "./helpers/auth";
import {
  countConciergeReplies,
  gotoConcierge,
  sendConciergeMessage,
  waitForConciergeReply,
  waitForRentalCards,
} from "./helpers/maps-layout";

/**
 * SAN-1626 checkpoint 9.8 — signed-in renter concierge at 390 × 844.
 *
 * Guest 390px browse/map (prod-rentals-mobile-form-map) and the signed-in host
 * thread (app/host-ai-continuity, viewportWidth 390) were already proven. This
 * covers the remaining gap: a signed-in renter asking for a real apartment on a
 * phone, getting grounded cards, following up, and keeping the conversation
 * across a reload.
 *
 * Authenticated pages must not leak credentials or private DOM into artifacts.
 */
test.use({ viewport: { width: 390, height: 844 }, trace: "off", screenshot: "off", video: "off" });

const QA_SUPER_ADMIN = "mde@socialmediaville.ca";

test.describe("SAN-1626 · signed-in renter concierge on a 390px phone", () => {
  test.skip(!hasE2eEnv(), "Needs the live Supabase e2e credentials");

  test("asks, gets grounded cards, follows up and survives a reload", async ({ browser, baseURL }) => {
    test.setTimeout(420_000);
    const origin = new URL(baseURL ?? "https://www.mdeai.co").origin;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await signInAsOnOrigin(page, origin, QA_SUPER_ADMIN);

    await gotoConcierge(page);
    const region = page.getByTestId("copilot-chat-region");
    await expect(region).toBeVisible({ timeout: 30_000 });
    const box = await region.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.width ?? 0).toBeLessThanOrEqual(390);

    const before = await countConciergeReplies(page);
    await sendConciergeMessage(page, "Find a furnished 2-bedroom apartment in Laureles under COP 3 million.");
    await waitForRentalCards(page);
    expect(await page.getByTestId("rental-card").count()).toBeGreaterThan(0);
    await waitForConciergeReply(page, before);

    const afterFirst = await countConciergeReplies(page);
    const followUp = await (async () => {
      await sendConciergeMessage(page, "Which one has a balcony?");
      return waitForConciergeReply(page, afterFirst);
    })();
    expect(followUp.length).toBeGreaterThan(0);

    expect(await countConciergeReplies(page)).toBeGreaterThanOrEqual(2);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("copilot-chat-region")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => countConciergeReplies(page), { timeout: 60_000, message: "transcript after reload" })
      .toBeGreaterThanOrEqual(2);

    const guest = await browser.newContext();
    const anon = await guest.request.get(`${origin}/api/copilotkit/info`);
    expect(anon.status()).toBe(401);
    await guest.close();
    await context.close();
  });
});
