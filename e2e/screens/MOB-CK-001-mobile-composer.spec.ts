import { test, expect, type Locator, type Page } from "@playwright/test";
import { hasE2eEnv, signInAs } from "../helpers/auth";

const SCREEN_ID = "MOB-CK-001";
const PHONE_390 = { width: 390, height: 844 };
const PHONE_360 = { width: 360, height: 740 };
const KEYBOARD_PROXY_HEIGHT = 520;
const LONG_MESSAGE =
  "I need a quiet furnished apartment in Laureles for remote work, with reliable Wi-Fi, two bedrooms, a desk, natural light, and enough detail to compare several real options without losing what I already selected on the map.";

async function gotoComposer(page: Page) {
  const response = await page.goto("/chat", { waitUntil: "domcontentloaded" });
  expect(response?.ok(), "GET /chat").toBe(true);

  await expect(page.getByTestId("concierge-chat-view-mounted")).toHaveCount(1, {
    timeout: 30_000,
  });

  const region = page.getByTestId("copilot-chat-region");
  const input = region.getByTestId("copilot-chat-textarea");
  const send = region.getByTestId("copilot-send-button");

  await expect(region).toBeVisible({ timeout: 30_000 });
  await expect(input).toBeVisible({ timeout: 30_000 });
  await expect(send).toBeVisible({ timeout: 30_000 });

  return {
    region,
    input,
    send,
    center: page.getByTestId("center-chat-panel"),
  };
}

async function expectInsideViewport(page: Page, locator: Locator, label: string) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewport must exist");
  // A viewport/keyboard resize is asynchronous; poll until the element settles
  // inside the visible viewport instead of sleeping a fixed time.
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox();
        if (!box) return false;
        return (
          box.x >= -1 &&
          box.y >= -1 &&
          box.x + box.width <= viewport.width + 1 &&
          box.y + box.height <= viewport.height + 1
        );
      },
      {
        timeout: 5_000,
        message: `${label} must settle inside the ${viewport.width}×${viewport.height} viewport`,
      },
    )
    .toBe(true);
}

async function expectMinimumTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} must have a rendered box`);
  expect(box.width, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function expectNoHorizontalOverflow(page: Page) {
  // Compare inside the page and return booleans, so no DOM measurement crosses
  // the boundary and none of them needs a non-null assertion.
  const fits = await page.evaluate(() => {
    const fitsElement = (element: Element | null) =>
      element ? element.scrollWidth <= element.clientWidth + 1 : null;
    const center = document.querySelector('[data-testid="center-chat-panel"]');
    const region = document.querySelector('[data-testid="copilot-chat-region"]');
    return {
      document: fitsElement(document.documentElement),
      center: fitsElement(center),
      region: fitsElement(region),
    };
  });

  expect(fits.document, "document horizontal overflow").toBe(true);
  expect(fits.center, "center panel present and free of horizontal overflow").toBe(true);
  expect(fits.region, "chat region present and free of horizontal overflow").toBe(true);
}

/**
 * Type a draft that must survive the /chat connect window.
 *
 * While the concierge runtime info is still resolving (locally this is visible
 * as repeated `/api/copilotkit/info` 401s and "Agent conciergeAgent not found"),
 * CopilotKit swaps the provisional agent and can reset its controlled composer
 * value. Use real keystrokes (not `fill`, which sets the DOM value without
 * updating React's controlled state) and retry across that window; the
 * assertion is unchanged — the draft must type in and Send must enable.
 */
async function typeDraft(
  page: Page,
  input: Locator,
  send: Locator,
  text: string,
) {
  await expect(async () => {
    await input.click();
    await input.fill("");
    await input.pressSequentially(text, { delay: 2 });
    await expect(input).toHaveValue(text, { timeout: 1_500 });
    await expect(send).toBeEnabled({ timeout: 1_500 });
  }).toPass({ timeout: 45_000, intervals: [500, 1_000] });
  await expect(input).toHaveValue(text);
}

test.describe(`${SCREEN_ID} CopilotKit v2 mobile composer`, () => {
  test.use({
    viewport: PHONE_390,
    isMobile: true,
    hasTouch: true,
  });

  test("uses the current v2 controls and keeps the mobile accessibility contract", async ({
    page,
  }) => {
    const { region, input, send } = await gotoComposer(page);

    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);

    const fontSize = await input.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    expect(fontSize).toBeGreaterThanOrEqual(16);

    await expectMinimumTouchTarget(send, "Send");
    await expect(input).toHaveAttribute("enterkeyhint", "send");
    await expect(input).toHaveAttribute("inputmode", "text");

    await expectInsideViewport(page, region, "chat region");
    await expectInsideViewport(page, input, "composer");
    await expectInsideViewport(page, send, "Send");
    await expectNoHorizontalOverflow(page);
  });

  for (const viewport of [PHONE_390, PHONE_360]) {
    test(`keeps the draft, composer and Send reachable through keyboard-height changes at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const { center, input, send } = await gotoComposer(page);

      await typeDraft(page, input, send, LONG_MESSAGE);
      await expectInsideViewport(page, input, "composer before keyboard proxy");
      await expectInsideViewport(page, send, "Send before keyboard proxy");
      await expectNoHorizontalOverflow(page);

      await page.setViewportSize({
        width: viewport.width,
        height: KEYBOARD_PROXY_HEIGHT,
      });

      await expect(input).toBeFocused();
      await expect(input).toHaveValue(LONG_MESSAGE);
      await expect(send).toBeEnabled();
      await expectInsideViewport(page, input, "composer with keyboard proxy");
      await expectInsideViewport(page, send, "Send with keyboard proxy");
      await expectInsideViewport(page, center, "center panel");
      await expectNoHorizontalOverflow(page);

      await page.setViewportSize(viewport);
      await expect(input).toHaveValue(LONG_MESSAGE);
      await expect(send).toBeEnabled();
      await expectInsideViewport(page, input, "composer after keyboard closes");
      await expectInsideViewport(page, send, "Send after keyboard closes");
      await expectNoHorizontalOverflow(page);
    });
  }

  test("survives a rotation-style viewport resize without moving the composer off-screen", async ({
    page,
  }) => {
    const { input, send } = await gotoComposer(page);
    await input.focus();

    await page.setViewportSize({ width: 844, height: 390 });
    await expectInsideViewport(page, input, "composer in landscape");
    await expectInsideViewport(page, send, "Send in landscape");
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize(PHONE_390);
    await expectInsideViewport(page, input, "composer after portrait restore");
    await expectInsideViewport(page, send, "Send after portrait restore");
  });

  test("keeps the composer clear of a keyboard that overlays the layout viewport", async ({
    page,
  }) => {
    // iOS keeps the layout viewport at full height and overlays the keyboard, so
    // the page-viewport resize above does not model it. Shrink only the visual
    // viewport and prove the composer still clears the covered strip.
    await page.addInitScript(() => {
      const KEYBOARD_HEIGHT = 320;
      const listeners = new Set<EventListener>();
      const fake = {
        get width() {
          return window.innerWidth;
        },
        get height() {
          return window.innerHeight - KEYBOARD_HEIGHT;
        },
        offsetTop: 0,
        offsetLeft: 0,
        pageTop: 0,
        pageLeft: 0,
        scale: 1,
        addEventListener: (_type: string, listener: EventListener) => {
          listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: EventListener) => {
          listeners.delete(listener);
        },
        dispatchEvent: () => true,
      };
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        get: () => fake,
      });
    });

    const { input, send } = await gotoComposer(page);
    await typeDraft(page, input, send, LONG_MESSAGE);

    const visualBottom = await page.evaluate(
      () => window.visualViewport?.height ?? window.innerHeight,
    );
    await expect
      .poll(
        async () => {
          const box = await send.boundingBox();
          return box ? Math.round(box.y + box.height) : Number.POSITIVE_INFINITY;
        },
        { timeout: 5_000, message: "composer above the overlaying keyboard" },
      )
      .toBeLessThanOrEqual(Math.round(visualBottom) + 1);

    await expect(send).toBeEnabled();
    await expect(input).toHaveValue(LONG_MESSAGE);
    await expectNoHorizontalOverflow(page);
  });

  test("reduced motion disables the send-control transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { send } = await gotoComposer(page);
    const transitionDuration = await send.evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    );
    expect(transitionDuration).toBe("0s");
  });

  test("one signed-in v2 submit produces exactly one finished agent run and one reply", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    test.skip(!hasE2eEnv(), "Supabase e2e env is required for a real signed-in agent turn");

    await signInAs(page);

    const runRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/api/copilotkit") &&
        (request.postData() ?? "").includes('"agent/run"')
      ) {
        runRequests.push(request.url());
      }
    });

    const { region, input, send } = await gotoComposer(page);
    const replies = region.getByTestId("copilot-assistant-message");
    const replyCountBefore = await replies.count();
    const runCountBefore = runRequests.length;

    const prompt =
      "In about 120 words, explain why Medellín has a mild climate. Do not use tools.";
    await typeDraft(page, input, send, prompt);

    // A cold /chat connect can swap the provisional agent after typeDraft has
    // made Send enabled, swallowing the click. Retry the submit until one
    // agent/run request is observed. The count comes from the request event, so
    // a slow-but-accepted first click is never submitted a second time.
    const runResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/copilotkit") &&
        (response.request().postData() ?? "").includes('"agent/run"'),
      { timeout: 120_000 },
    );

    await expect(async () => {
      if (runRequests.length === runCountBefore) {
        await typeDraft(page, input, send, prompt);
        await send.click();
      }
      await expect
        .poll(() => runRequests.length, { timeout: 4_000 })
        .toBeGreaterThan(runCountBefore);
    }).toPass({ timeout: 90_000, intervals: [1_000, 2_000] });

    const response = await runResponse;
    expect(response.status(), "agent/run status").toBe(200);
    await response.finished();

    await expect
      .poll(() => replies.count(), {
        timeout: 120_000,
        message: "exactly one new concierge assistant reply",
      })
      .toBe(replyCountBefore + 1);

    expect(runRequests.length - runCountBefore, "agent/run request count").toBe(1);

    await page.setViewportSize({
      width: PHONE_390.width,
      height: KEYBOARD_PROXY_HEIGHT,
    });
    await input.focus();
    await expectInsideViewport(page, input, "composer after agent reply");
    await expectInsideViewport(page, send, "Send after agent reply");
    await expectNoHorizontalOverflow(page);
  });
});
