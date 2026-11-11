import { expect, test, type Page } from "./fixtures";
import { loadEnvLocalForE2E } from "./helpers/auth";

loadEnvLocalForE2E();

/**
 * Opt-in, private renter QA only. Failures are injected into THIS browser
 * via Playwright routing; no production API, database or deployment is changed.
 *
 * A 503 after dispatch must NOT offer unsafe duplicate-send Retry.
 * Retry for a known-not-dispatched request is covered by the existing composer
 * component tests; real Stop/resend by prod-concierge-stop-retry.spec.ts.
 */
const enabled = process.env.MDE_SAN1631_POSTMERGE === "1";
test.use({
  qaRole: "renter",
  viewport: { width: 1440, height: 900 },
  screenshot: "off",
  trace: "off",
  video: "off",
});
test.skip(!enabled, "Set MDE_SAN1631_POSTMERGE=1 for explicit QA write consent.");

test.beforeAll(() => {
  if (enabled && !process.env.MDE_QA_RENTER_EMAIL) {
    throw new Error("A dedicated existing renter QA identity is required.");
  }
});

/** The visible rental composer for the current viewport. */
const composer = (page: Page) =>
  page.locator('[data-testid="rental-ask-composer"]:visible').first();
const QUESTION = "Find furnished 2-bedroom apartments in Laureles under COP 3 million.";
const STALE_QUESTION = "Find furnished 3-bedroom apartments in Laureles under COP 3 million.";

/** Open Rentals and wait for the composer used by every recovery test. */
async function openRentalComposer(page: Page) {
  const response = await page.goto("/rentals", { waitUntil: "domcontentloaded" });
  expect(response?.ok(), "Rental document must load before testing AI failure behavior").toBe(true);
  await expect(page.getByTestId("rentals-browse")).toBeVisible({ timeout: 30_000 });
  const active = composer(page);
  await expect(active).toBeVisible({ timeout: 30_000 });
  return active;
}

test("a simulated CopilotKit 503 reports an error without unsafe duplicate Retry", async ({ qaRolePage: page }) => {
  test.setTimeout(180_000);
  // Do not intercept CopilotKit startup traffic: the agent can POST while
  // the page mounts. Install the failure only AFTER normal Send is enabled.
  const active = await openRentalComposer(page);
  const input = active.locator("#rental-ask-input");
  await input.fill(QUESTION);
  await expect(active.getByTestId("rental-ask-send")).toBeEnabled({ timeout: 45_000 });

  let intercepted = 0;
  await page.route("**/api/copilotkit**", async (route) => {
    if (route.request().method() !== "POST" || intercepted > 0) {
      await route.continue();
      return;
    }
    intercepted++;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"QA-simulated temporary unavailability"}',
    });
  });

  await active.getByTestId("rental-ask-send").click();
  await expect.poll(() => intercepted, { timeout: 30_000 }).toBe(1);
  await expect(active.getByTestId("rental-ask-error")).toBeVisible({ timeout: 45_000 });

  // The run may have started, so a blind Retry can create duplicate questions.
  await expect(active.getByTestId("rental-ask-retry")).toHaveCount(0);
  await expect(active.getByTestId("rental-ask-stop")).toBeHidden({ timeout: 30_000 });

  // The app remains usable, and explicit native page controls still work.
  await input.fill("On this page, show only 1-bedroom apartments in Laureles.");
  const send = active.getByTestId("rental-ask-send");
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await send.click();
  await expect.poll(() => new URL(page.url()).search).toBe("?neighborhood=Laureles&beds=1");
  expect(intercepted).toBe(1); // No extra agent POST for native page navigation.
});

test("a slow stopped AI request cannot resurrect stale filters after page switching", async ({ qaRolePage: page }) => {
  test.setTimeout(180_000);

  let started!: () => void;
  let release!: () => void;
  const intercepted = new Promise<void>((resolve) => { started = resolve; });
  const continueRequest = new Promise<void>((resolve) => { release = resolve; });
  const active = await openRentalComposer(page);
  await active.locator("#rental-ask-input").fill(STALE_QUESTION);
  await expect(active.getByTestId("rental-ask-send")).toBeEnabled({ timeout: 45_000 });
  await page.route("**/api/copilotkit**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    started();
    await continueRequest;
    // Let the real late response reach the browser; Stop must still win.
    await route.continue();
  });

  await active.getByTestId("rental-ask-send").click();

  try {
    await intercepted; // A real client CopilotKit POST was initiated.
    const stop = active.getByTestId("rental-ask-stop");
    await expect(stop).toBeVisible({ timeout: 30_000 });
    await stop.click();

    // The manual choice is 2 bedrooms while the stopped question asked for 3.
    await page.getByTestId("rentals-filter-beds-2").click();
    await expect.poll(() => new URL(page.url()).searchParams.get("beds")).toBe("2");

    const lateResponse = page.waitForResponse((r) =>
      r.url().includes("/api/copilotkit") && r.request().method() === "POST",
    { timeout: 60_000 }).catch(() => null);
    release();
    await lateResponse;
    await expect(active.getByTestId("rental-ask-stop")).toHaveCount(0, { timeout: 60_000 });
    expect(new URL(page.url()).searchParams.get("beds")).toBe("2");
    await page.goto("/events", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("events-browse")).toBeVisible({ timeout: 60_000 });
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("rentals-browse")).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get("beds")).toBe("2");
    await expect(page.getByTestId("rental-ask-error")).toHaveCount(0);
  } finally {
    release();
  }
});

test("a normal rental AI question still reaches the agent and completes", async ({ qaRolePage: page }) => {
  test.setTimeout(180_000);
  const active = await openRentalComposer(page);
  const input = active.locator("#rental-ask-input");
  await input.fill(QUESTION);
  await expect(active.getByTestId("rental-ask-send")).toBeEnabled({ timeout: 45_000 });

  const responsePromise = page.waitForResponse((r) =>
    r.url().includes("/api/copilotkit") && r.request().method() === "POST",
  { timeout: 60_000 });
  await active.getByTestId("rental-ask-send").click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);

  // 200 only proves the stream started. Wait for the run to end, then inspect the
  // actual AG-UI stream: a tool result plus completed text proves an agent turn,
  // not the page's local fallback search.
  await expect(active.getByTestId("rental-ask-stop")).toHaveCount(0, { timeout: 90_000 });
  const stream = await response.text();
  expect(stream).toContain('"type":"TOOL_CALL_RESULT"');
  expect(stream).toContain('"type":"TEXT_MESSAGE_END"');
  expect(stream).toContain('"type":"RUN_FINISHED"');
  await expect(active.getByTestId("rental-ask-error")).toHaveCount(0);
});
