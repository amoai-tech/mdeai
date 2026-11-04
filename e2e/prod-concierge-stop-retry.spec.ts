import { test, expect, type Page } from "./fixtures";

/**
 * SAN-1605 · Journey B — a real Stop on the shipped /rentals composer.
 *
 * Until this existed, every Stop assertion in the repository was a mock or a
 * mocked SSE stream. This drives the product surface as a signed-in renter and
 * proves only what it actually checks:
 *
 *   1. the answer really starts (the Stop control exists only while a run streams),
 *   2. pressing Stop ends the running state,
 *   3. a Stop does NOT surface a retryable error banner,
 *   4. the composer is still usable after a refresh.
 *
 * Explicit non-claims:
 *   - transactional rollback. Mastra cancellation is cooperative, so a tool that
 *     already started may still finish. Duplicate-write protection is proven
 *     separately by rental-conversion-journey (one lead, one showing, replay
 *     creates nothing).
 *   - transcript persistence across a refresh on this surface; that guarantee
 *     belongs to /chat and is proven by prod-concierge-thread-lifecycle.
 *   - the retryable Retry control: /rentals renders `rental-ask-retry` only for a
 *     retryable error, and a user Stop produces none.
 *
 * The second test covers recovery after Stop. During development one run showed the
 * banner "MDE could not answer that…" on the re-sent question; re-running showed it
 * is NOT deterministic — the same flow produced a normal answer. It is therefore
 * treated as a transient provider/rate condition, not asserted as a defect, but the
 * banner is still captured in the failure message so a recurrence is diagnosable
 * instead of silent.
 */
test.use({ qaRole: "renter", trace: "off", screenshot: "off", video: "off" });

const QUESTION = "Find a furnished 2-bedroom apartment in Laureles under COP 3 million.";

async function openTranscript(page: Page): Promise<void> {
  const panel = page.getByTestId("rental-ask-transcript");
  if ((await panel.count()) === 0) {
    const toggle = page.getByTestId("rental-ask-toggle-transcript");
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();
  }
  await expect(page.getByTestId("rental-ask-transcript")).toBeVisible({ timeout: 30_000 });
}

async function transcriptText(page: Page): Promise<string> {
  const panel = page.getByTestId("rental-ask-transcript");
  if ((await panel.count()) === 0) return "";
  return (await panel.innerText()).trim();
}

test.describe("SAN-1605 · signed-in Stop on /rentals", () => {
  test.skip(
    !process.env.MDE_QA_RENTER_EMAIL,
    "Configure an existing dedicated renter QA identity (MDE_QA_RENTER_EMAIL)",
  );

  test("Stop ends the running state with no error banner", async ({ qaRolePage: page }) => {
    test.setTimeout(300_000);

    const res = await page.goto("/rentals", { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBe(true);

    const composer = page.getByTestId("rental-ask-composer");
    await expect(composer).toBeVisible({ timeout: 30_000 });
    const input = composer.locator("textarea, input").first();
    const stop = page.getByTestId("rental-ask-stop");
    const errorBanner = page.getByTestId("rental-ask-error");

    // 1 — a real run starts.
    await input.fill(QUESTION);
    await composer.getByTestId("rental-ask-send").click();
    await expect(stop).toBeVisible({ timeout: 60_000 });

    // 2 — Stop ends the running state.
    await stop.click();
    await expect(stop).toBeHidden({ timeout: 60_000 });

    // 3 — a user Stop is not an error. This must fail if a banner appears.
    await expect(errorBanner).toHaveCount(0);

    // The stopped turn left real content behind, not an empty shell.
    await openTranscript(page);
    expect((await transcriptText(page)).length).toBeGreaterThan(0);

    // 4 — the composer survives a refresh and is usable.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("rental-ask-composer")).toBeVisible({ timeout: 30_000 });
    await expect(composer.locator("textarea, input").first()).toBeEnabled({ timeout: 30_000 });
  });

  test("a question sent immediately after Stop produces a new answer", async ({ qaRolePage: page }) => {
    test.setTimeout(300_000);

    await page.goto("/rentals", { waitUntil: "domcontentloaded" });
    const composer = page.getByTestId("rental-ask-composer");
    await expect(composer).toBeVisible({ timeout: 30_000 });
    const input = composer.locator("textarea, input").first();
    const send = composer.getByTestId("rental-ask-send");
    const stop = page.getByTestId("rental-ask-stop");
    const errorBanner = page.getByTestId("rental-ask-error");

    await input.fill(QUESTION);
    await send.click();
    await expect(stop).toBeVisible({ timeout: 60_000 });
    await stop.click();
    await expect(stop).toBeHidden({ timeout: 60_000 });

    await openTranscript(page);
    const afterStop = await transcriptText(page);

    await input.fill(QUESTION);
    await send.click();
    await expect
      .poll(() => transcriptText(page), { timeout: 180_000, message: "new answer after Stop" })
      .not.toBe(afterStop);

    // The defect this test documents: the product shows a failure banner instead.
    if ((await errorBanner.count()) > 0) {
      const message = await errorBanner.first().innerText().catch(() => "(unreadable)");
      throw new Error(`re-send after Stop failed with: ${message}`);
    }
  });
});
