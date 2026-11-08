import { test, expect } from "./fixtures";
import {
  countConciergeReplies,
  gotoConcierge,
  sendConciergeMessage,
  waitForConciergeReply,
} from "./helpers/maps-layout";

/**
 * SAN-1626 checkpoint 9.8 — signed-in renter concierge at 390 × 844.
 *
 * Guest 390px browse/map (prod-rentals-mobile-form-map) and the signed-in host
 * thread (app/host-ai-continuity, viewportWidth 390) were already proven. This
 * covers the remaining gap: a renter asking for a real apartment on a phone,
 * getting grounded cards, following up, and keeping the conversation across a
 * reload.
 *
 * Identity: the dedicated `renter` QA role, never Super Admin. `qa-roles.ts`
 * refuses a missing or non-`qa-*@mdeai.co` account and never substitutes an
 * admin, so this skips (rather than silently proving the wrong user's journey)
 * until `MDE_QA_RENTER_EMAIL` is configured.
 *
 * Authenticated pages must not leak credentials or private DOM into artifacts.
 */
const RENTAL_QUESTION = "Find a furnished 2-bedroom apartment in Laureles under COP 3 million.";

test.use({
  qaRole: "renter",
  viewport: { width: 390, height: 844 },
  trace: "off",
  screenshot: "off",
  video: "off",
});

/** Whitespace-insensitive containment, so layout wrapping cannot break the match. */
function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * The concierge answers some questions with cards, so the assistant bubble can
 * exist for a moment before its content is painted. Wait for real text, then
 * capture it — an empty capture would make the reload assertion meaningless.
 */
async function replyTextAfter(page: import("@playwright/test").Page, before: number): Promise<string> {
  await waitForConciergeReply(page, before);
  const last = page.getByTestId("copilot-chat-region").getByTestId("copilot-assistant-message").last();
  await expect
    .poll(async () => normalize(await last.innerText()).length, {
      timeout: 30_000,
      message: "assistant reply renders content",
    })
    .toBeGreaterThan(0);
  return normalize(await last.innerText());
}

/**
 * Production certification must FAIL when the renter identity is missing — a green
 * suite containing only a skip proves nothing. Outside certification the spec skips,
 * so ordinary local/PR runs stay honest without demanding the QA account.
 */
const CERTIFICATION = process.env.MDE_PROD_CERTIFICATION === "1";

test.describe("SAN-1626 · signed-in renter concierge on a 390px phone", () => {
  test.skip(
    !CERTIFICATION && !process.env.MDE_QA_RENTER_EMAIL,
    "Configure an existing dedicated renter QA identity (MDE_QA_RENTER_EMAIL)",
  );

  test("asks, gets grounded cards, follows up and survives a reload", async ({ qaRolePage: page }) => {
    test.setTimeout(420_000);

    const rentalApiStatuses: number[] = [];
    // SAN-1074: distinguish transient rental API failure from an empty UI or
    // a delayed AG-UI bubble. Only log the fixed path, status and the already
    // sanitized error code; never request bodies, cookies or user data.
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/api/rentals/search" &&
          response.request().method() === "POST") {
        rentalApiStatuses.push(response.status());
        console.info("SAN-1074 rental API", JSON.stringify({
          path: "/api/rentals/search", status: response.status(),
        }));
      }
    });
    page.on("console", (message) => {
      if (message.text().startsWith("[rental-fast-path] /api/rentals/search")) {
        console.info("SAN-1074 rental API error", message.text().slice(0, 220));
      }
    });

    await gotoConcierge(page);
    const region = page.getByTestId("copilot-chat-region");
    await expect(region).toBeVisible({ timeout: 30_000 });
    const box = await region.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.width ?? 0).toBeLessThanOrEqual(390);

    // 1 — the requested 2-bedroom search must itself return cards. No fallback
    // query and no retry with different criteria: zero cards is a failure.
    const before = await countConciergeReplies(page);
    await sendConciergeMessage(page, RENTAL_QUESTION);
    const cards = page.getByTestId("rental-card");
    await expect(cards.first()).toBeVisible({ timeout: 120_000 });
    const groundedCardCount = await cards.count();
    expect(groundedCardCount).toBeGreaterThan(0);
    const firstReply = await replyTextAfter(page, before);

    // 2 — a follow-up runs on the same conversation.
    const afterFirst = await countConciergeReplies(page);
    await sendConciergeMessage(page, "Which one has a balcony?");
    const secondReply = await replyTextAfter(page, afterFirst);

    // 3 — reload keeps THESE two replies, not merely two replies.
    const expectedReplies = [firstReply, secondReply].map(normalize).map((text) => text.slice(0, 120));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("copilot-chat-region")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const transcript = normalize(await page.getByTestId("copilot-chat-region").innerText());
          return expectedReplies.filter((text) => transcript.includes(text)).length;
        },
        { timeout: 60_000, message: "both pre-reload replies are still in the transcript" },
      )
      .toBe(expectedReplies.length);

    // 4 — an anonymous caller is still refused the runtime.
    const guest = await page.context().browser()!.newContext();
    const anon = await guest.request.get(`${new URL(page.url()).origin}/api/copilotkit/info`);
    expect(anon.status()).toBe(401);
    await guest.close();

    // A single successful test is a SAMPLE of an actual signed-in journey,
    // not the measured production success rate. Emit only non-sensitive
    // counters so CI can retain a defensible observation per deployed SHA.
    console.info("SAN-1074 grounded-journey", JSON.stringify({
      outcome: "passed",
      viewportWidth: 390,
      rentalApiStatuses,
      groundedCardCount,
      // Snapshot when saved replies have returned; this is not a guarantee that
      // card restoration will never finish later in the render lifecycle.
      cardsVisibleWhenRepliesRestored: await cards.count(),
      firstReplyNonempty: firstReply.length > 0,
      followUpNonempty: secondReply.length > 0,
      refreshPreservedBoth: true,
      anonymousRuntimeDenied: true,
    }));
  });
});
