import { test, expect, type Page } from "./fixtures";
import { loadEnvLocalForE2E } from "./helpers/auth";

loadEnvLocalForE2E();

/**
 * SAN-1605 · Journey B — a real Stop on the shipped /rentals composer.
 *
 * Until this existed, every Stop assertion in the repository was a mock or a
 * mocked SSE stream. This drives the product surface as a signed-in renter and
 * proves only what it actually checks:
 *
 *   1. an authenticated CopilotKit request receives a successful HTTP response,
 *      and Stop is available while the composer is still busy,
 *   2. pressing Stop returns the composer to its idle state,
 *   3. a Stop does NOT surface a retryable error banner,
 *   4. a question sent afterwards produces a NEW ASSISTANT turn, not merely an
 *      echoed question, and that run settles with no error banner,
 *   5. after a refresh the composer is idle and usable for a new question.
 *
 * Explicit non-claims:
 *   - transactional rollback. Mastra cancellation is cooperative, so a tool that
 *     already started may still finish. Duplicate-write protection is proven
 *     separately by rental-conversion-journey (one lead, one showing, replay
 *     creates nothing).
 *   - transcript persistence across a refresh on this surface; that guarantee
 *     belongs to /chat and is proven by prod-concierge-thread-lifecycle.
 *   - the retryable Retry control: /rentals renders `rental-ask-retry` only for a
 *     retryable error, and a user Stop produces none, so the recovery path after
 *     Stop is sending again.
 */
// The dedicated permanent renter QA identity remains intact. Aborting an AI
// stream can leave server-side output processors running AFTER the browser is idle;
// deleting its thread/user in an E2E teardown can trigger FK errors in production.
// Runs require explicit opt-in. Safely draining and purging QA records is a
// separate backend lifecycle concern, not a test-teardown shortcut.
test.use({ qaRole: "renter", trace: "off", screenshot: "off", video: "off", viewport: { width: 1440, height: 900 } });

const QUESTION = "Find a furnished 2-bedroom apartment in Laureles under COP 3 million.";
const composer = (page: Page) => page.locator('[data-testid="rental-ask-composer"]:visible').first();

function streamResponse(page: Page) {
  // A Stop button appears even during the pre-request `sending` state. Wait
  // until the CopilotKit run request carrying this specific question responds.
  return page.waitForResponse(
    (res) => res.request().method() === "POST" &&
      res.url().includes("/api/copilotkit") &&
      res.request().postData()?.includes(QUESTION) === true && res.ok(),
    { timeout: 60_000 },
  );
}

async function openTranscript(page: Page): Promise<void> {
  const panel = composer(page).getByTestId("rental-ask-transcript");
  if ((await panel.count()) === 0) {
    const toggle = composer(page).getByTestId("rental-ask-toggle-transcript");
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();
  }
  await expect(panel).toBeVisible({ timeout: 30_000 });
}

/**
 * Mark the assistant rows that existed BEFORE resending. /rentals shows only
 * the last six turns, so comparing assistant counts gives a false failure when
 * an older answer falls off the list. React retains the existing keyed <li>s;
 * a new assistant turn gets a new row even when its text happens to be identical.
 */
async function markExistingAssistantTurns(page: Page): Promise<void> {
  await composer(page).getByTestId("rental-ask-transcript").locator("li").evaluateAll((rows) => {
    for (const row of rows) {
      if (row.firstElementChild?.textContent?.trim() === "MDE") {
        row.setAttribute("data-existing-assistant-turn", "");
      }
    }
  });
}

/** The composer is idle only when Stop is gone, Send is back and the input accepts text. */
async function expectComposerIdle(page: Page, timeout = 60_000): Promise<void> {
  const active = composer(page);
  const send = active.getByTestId("rental-ask-send");
  const input = active.locator("textarea, input").first();
  await expect(active.getByTestId("rental-ask-stop")).toBeHidden({ timeout });
  await expect(send).toBeVisible({ timeout });
  await expect(input).toBeEnabled({ timeout });
  // Send is correctly disabled for an empty draft. Actually type, confirm
  // Send can enable, then clear without starting another request.
  await input.fill("Can I search rentals?");
  await expect(send).toBeEnabled({ timeout });
  await input.fill("");
}

/** After the run has settled, a user-visible error banner is a real defect. */
async function expectNoErrorBanner(page: Page): Promise<void> {
  const banner = composer(page).getByTestId("rental-ask-error");
  const count = await banner.count();
  if (count > 0) {
    const message = await banner.first().innerText().catch(() => "(unreadable)");
    throw new Error(`run settled with a user-visible error banner: ${message}`);
  }
}

test.describe("SAN-1605 · signed-in Stop on /rentals", () => {
  test.skip(
    process.env.MDE_QA_STOP_RETRY_WRITE !== "1" || !process.env.MDE_QA_RENTER_EMAIL,
    "Set MDE_QA_STOP_RETRY_WRITE=1 and existing MDE_QA_RENTER_EMAIL for opt-in real QA writes",
  );

  test("Stop returns the composer to idle with no error banner", async ({ qaRolePage: page }) => {
    test.setTimeout(300_000);

    const res = await page.goto("/rentals", { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBe(true);

    const active = composer(page);
    await expect(active).toBeVisible({ timeout: 30_000 });
    const input = active.locator("textarea, input").first();
    const stop = active.getByTestId("rental-ask-stop");

    // 1 — a real CopilotKit request responds before attempting Stop.
    await input.fill(QUESTION);
    const firstResponse = streamResponse(page);
    await active.getByTestId("rental-ask-send").click();
    await firstResponse;
    await expect(stop).toBeVisible({ timeout: 60_000 });

    // 2 — Stop, then wait for the composer to actually settle rather than
    // trusting the Stop element's disappearance alone.
    await stop.click();
    await expectComposerIdle(page);

    // 3 — a user Stop is not an error, asserted AFTER the run settled so the
    // banner has had its chance to render.
    await expectNoErrorBanner(page);

    // 4 — the composer survives a refresh and is genuinely idle and usable.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(composer(page)).toBeVisible({ timeout: 30_000 });
    await expectComposerIdle(page, 30_000);
  });

  test("a question sent after Stop produces a new assistant answer", async ({ qaRolePage: page }) => {
    test.setTimeout(300_000);

    await page.goto("/rentals", { waitUntil: "domcontentloaded" });
    const active = composer(page);
    await expect(active).toBeVisible({ timeout: 30_000 });
    const input = active.locator("textarea, input").first();
    const send = active.getByTestId("rental-ask-send");
    const stop = active.getByTestId("rental-ask-stop");

    await input.fill(QUESTION);
    const firstResponse = streamResponse(page);
    await send.click();
    await firstResponse;
    await expect(stop).toBeVisible({ timeout: 60_000 });
    await stop.click();
    await expectComposerIdle(page);
    await expectNoErrorBanner(page);

    await openTranscript(page);
    await markExistingAssistantTurns(page);

    // The recovery path after a Stop is sending again. Observe the new run
    // starting AND settling; a stale answer from the first run is not proof.
    await input.fill(QUESTION);
    const secondResponse = streamResponse(page);
    await send.click();
    await secondResponse;
    await expectComposerIdle(page, 180_000);
    await expectNoErrorBanner(page);

    // The last transcript row must be the answer AFTER the newly resent You
    // turn, not an older reply or merely a response-count increase. A bounded
    // six-turn window can evict older answers without changing its length.
    const lastRow = composer(page).getByTestId("rental-ask-transcript").locator("li").last();
    await expect(lastRow.locator("span").first()).toHaveText("MDE");
    await expect(lastRow.locator("span").nth(1)).not.toBeEmpty();
    await expect(lastRow).not.toHaveAttribute("data-existing-assistant-turn", "");
  });
});
