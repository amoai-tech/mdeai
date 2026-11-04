import { test, expect, type Page } from "./fixtures";

/**
 * SAN-1605 · Journey B — a real Stop on the shipped /rentals composer.
 *
 * Until this existed, every Stop assertion in the repository was a mock or a
 * mocked SSE stream. This drives the product surface as a signed-in renter and
 * proves only what it actually checks:
 *
 *   1. the answer really starts (the Stop control exists only while a run streams),
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

/**
 * The transcript holds BOTH speakers as `<li><span>You|MDE</span>…`. Comparing the
 * whole transcript text would pass the moment the renter's own question is echoed,
 * which is exactly the false proof this test must avoid — so count only the
 * assistant turns.
 */
async function assistantTurnCount(page: Page): Promise<number> {
  const items = page.getByTestId("rental-ask-transcript").locator("li");
  const total = await items.count();
  let assistant = 0;
  for (let index = 0; index < total; index += 1) {
    const text = (await items.nth(index).innerText()).trim();
    if (text.startsWith("MDE")) assistant += 1;
  }
  return assistant;
}

/** The composer is idle only when Stop is gone, Send is back and the input accepts text. */
async function expectComposerIdle(page: Page, timeout = 60_000): Promise<void> {
  await expect(page.getByTestId("rental-ask-stop")).toBeHidden({ timeout });
  await expect(page.getByTestId("rental-ask-send")).toBeVisible({ timeout });
  await expect(
    page.getByTestId("rental-ask-composer").locator("textarea, input").first(),
  ).toBeEnabled({ timeout });
}

/** After the run has settled, a user-visible error banner is a real defect. */
async function expectNoErrorBanner(page: Page): Promise<void> {
  const banner = page.getByTestId("rental-ask-error");
  const count = await banner.count();
  if (count > 0) {
    const message = await banner.first().innerText().catch(() => "(unreadable)");
    throw new Error(`run settled with a user-visible error banner: ${message}`);
  }
}

test.describe("SAN-1605 · signed-in Stop on /rentals", () => {
  test.skip(
    !process.env.MDE_QA_RENTER_EMAIL,
    "Configure an existing dedicated renter QA identity (MDE_QA_RENTER_EMAIL)",
  );

  test("Stop returns the composer to idle with no error banner", async ({ qaRolePage: page }) => {
    test.setTimeout(300_000);

    const res = await page.goto("/rentals", { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBe(true);

    const composer = page.getByTestId("rental-ask-composer");
    await expect(composer).toBeVisible({ timeout: 30_000 });
    const input = composer.locator("textarea, input").first();
    const stop = page.getByTestId("rental-ask-stop");

    // 1 — a real run starts; the Stop control only exists while streaming.
    await input.fill(QUESTION);
    await composer.getByTestId("rental-ask-send").click();
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
    await expect(page.getByTestId("rental-ask-composer")).toBeVisible({ timeout: 30_000 });
    await expectComposerIdle(page, 30_000);
  });

  test("a question sent after Stop produces a new assistant answer", async ({ qaRolePage: page }) => {
    test.setTimeout(300_000);

    await page.goto("/rentals", { waitUntil: "domcontentloaded" });
    const composer = page.getByTestId("rental-ask-composer");
    await expect(composer).toBeVisible({ timeout: 30_000 });
    const input = composer.locator("textarea, input").first();
    const send = composer.getByTestId("rental-ask-send");
    const stop = page.getByTestId("rental-ask-stop");

    await input.fill(QUESTION);
    await send.click();
    await expect(stop).toBeVisible({ timeout: 60_000 });
    await stop.click();
    await expectComposerIdle(page);
    await expectNoErrorBanner(page);

    await openTranscript(page);
    const baseline = await assistantTurnCount(page);

    // The recovery path after a Stop is sending again. A new assistant turn is
    // the only thing that proves MDE answered — an echoed question cannot, and a
    // run that never started cannot either.
    await input.fill(QUESTION);
    await send.click();
    await expect
      .poll(() => assistantTurnCount(page), {
        timeout: 180_000,
        message: "a new assistant turn appeared after Stop",
      })
      .toBeGreaterThan(baseline);

    // Only judge the outcome once the run has settled.
    await expectComposerIdle(page, 180_000);
    await expectNoErrorBanner(page);
    expect(await assistantTurnCount(page)).toBeGreaterThan(baseline);
  });
});
