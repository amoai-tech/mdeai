import { expect, type Page } from "@playwright/test";

const RENTAL_QUERY = "1BR apartment in Laureles under 80 dollars per night";

const GROUNDING_QUERY = "Quiet cafés near Laureles";

const NIGHTLIFE_GROUNDING_QUERY =
  "Salsa bars and rooftop cocktails locals go to in El Poblado";

const EVENT_QUERY = "salsa events this weekend in Medellín";

/** Marketing homepage — hero search, FAB, no GeoChatShell yet. */
export async function gotoMarketingHome(page: Page) {
  // The hero input is present in SSR markup before React is hydrated. Observe
  // the homepage CopilotKit handshake so tests do not type into pre-hydration
  // markup and lose the input event before React attaches its handlers.
  const runtimeHandshake = page.waitForResponse(
    (response) =>
      response.url().includes("/api/copilotkit") && response.status() === 200,
    { timeout: 30_000 },
  );
  const res = await page.goto("/", { waitUntil: "domcontentloaded" });
  if (!res?.ok()) {
    throw new Error(`GET / failed: ${res?.status()}`);
  }
  await page
    .getByRole("searchbox", { name: /ask the ai concierge/i })
    .waitFor({ state: "visible", timeout: 20_000 });
  await expect(page.getByTestId("home-concierge-search")).toHaveAttribute(
    "data-hydrated",
    "true",
    { timeout: 30_000 },
  );
  await runtimeHandshake;
  await hideCopilotWebInspector(page);
}

/** Hero Ask CTA — client navigates to /chat?q=… */
export async function submitHomeHeroQuery(page: Page, text: string) {
  const input = page.getByRole("searchbox", { name: /ask the ai concierge/i });
  await input.fill(text);
  await expect(input).toHaveValue(text);
  const submit = page.getByRole("button", { name: /^search$/i });
  await expect(submit).toBeEnabled({ timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/chat/, { timeout: 30_000 }),
    submit.click(),
  ]);
}

/** After home handoff: lands on /chat, ?q stripped, user message sent once. */
export async function waitForHomeToChatHandoff(page: Page, query: string) {
  await page.waitForURL(/\/chat/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/chat$/, { timeout: 60_000 });
  await page
    .locator('[data-testid="chat-canvas"]')
    .waitFor({ state: "visible", timeout: 20_000 });
  await waitForCopilotRuntime(page);
  const region = page.locator('[data-testid="copilot-chat-region"]');
  await expect(region.getByText(query, { exact: true })).toHaveCount(1, {
    timeout: 90_000,
  });
}

export async function assertConciergeShellVisible(page: Page) {
  await expect(page.locator('[data-testid="chat-canvas"]')).toBeVisible();
  await expect(page.locator('[data-testid="center-chat-panel"]')).toBeVisible();
  await expect(page.locator('[data-testid="map-panel"]')).toBeVisible();
  await expect(page.locator('[data-testid="chat-map"]')).toBeVisible();
}

/** Generic event query from home may clarify instead of rendering cards. */
export async function waitForHomeEventHandoff(page: Page) {
  const card = page.locator('[data-testid="event-card"]').first();
  const clarify = page.getByText(/What kind of events are you looking for/i);
  try {
    await Promise.race([
      card.waitFor({ state: "visible", timeout: 90_000 }),
      clarify.waitFor({ state: "visible", timeout: 90_000 }),
    ]);
  } catch {
    await waitForEventCards(page);
  }
}

/** Map panel shows at least one pin. */
export async function waitForMapPinsUpdated(page: Page, timeout = 120_000) {
  await page.waitForFunction(
    () => {
      const pins = document.querySelectorAll('[data-testid="map-pin"]');
      return pins.length > 0;
    },
    { timeout },
  );
}

/** Canonical concierge surface — GeoChatShell on /chat (D-13 restore). */
export async function gotoConcierge(page: Page) {
  const res = await page.goto("/chat", { waitUntil: "domcontentloaded" });
  if (!res?.ok()) {
    throw new Error(`GET /chat failed: ${res?.status()}`);
  }
  await page
    .locator('[data-testid="chat-canvas"]')
    .waitFor({ state: "visible", timeout: 20_000 });
  await hideCopilotWebInspector(page);
  await waitForCopilotRuntime(page);
}

/** @deprecated Use gotoConcierge — kept for existing e2e imports. */
export async function gotoHome(page: Page) {
  await gotoConcierge(page);
}

const CPK_INSPECTOR_HIDE_CSS =
  "cpk-web-inspector { display: none !important; pointer-events: none !important; }";

/** CopilotKit dev inspector overlay blocks sheet/modal clicks in e2e. */
export async function hideCopilotWebInspector(page: Page) {
  await page.addInitScript((css) => {
    const id = "mde-e2e-hide-cpk-inspector";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }, CPK_INSPECTOR_HIDE_CSS);
  // Also hide on the current document when called after navigation.
  await page
    .evaluate((css) => {
      const id = "mde-e2e-hide-cpk-inspector";
      if (document.getElementById(id)) return;
      const style = document.createElement("style");
      style.id = id;
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }, CPK_INSPECTOR_HIDE_CSS)
    .catch(() => undefined);
}

/** Wait for CopilotKit runtime handshake before co-agent / chat actions. */
export async function waitForCopilotRuntime(page: Page) {
  await page
    .waitForResponse(
      (r) => r.url().includes("/api/copilotkit") && r.status() === 200,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  await ensureChatInputVisible(page);
}

export async function ensureChatInputVisible(page: Page) {
  const input = page
    .locator(
      '[data-testid="copilot-chat-textarea"], .copilotKitInput textarea, [role="textbox"][placeholder*="message" i]',
    )
    .first();
  if (await input.isVisible().catch(() => false)) return;
  const open = page.getByRole("button", { name: /open chat/i });
  if (await open.isVisible().catch(() => false)) {
    await open.click();
  }
  await input.waitFor({ state: "visible", timeout: 15_000 });
}

/** One fill plus one submit attempt (multi-strategy send cascade). */
async function submitConciergeMessageOnce(page: Page, text: string) {
  await ensureChatInputVisible(page);
  const input = page
    .locator(
      '[data-testid="copilot-chat-textarea"], .copilotKitInput textarea, [role="textbox"][placeholder*="message" i]',
    )
    .first();
  await input.fill(text);
  await expect(input).toHaveValue(text);

  // CopilotKit v2 chat layouts differ (center panel, sidebar, welcome screen).
  // Try composer-scoped controls first, then broader fallbacks, then Enter.
  // sendNearComposer — CK-V2 ConciergeChatView mount + .copilotKitInput send
  // sendBesideInput — XPath: nearest ancestor row with buttons (legacy layouts)
  // controlSend — global .copilotKitInputControlButton (no mount testid)
  // namedSend — accessible "Send" label when class names drift
  // Enter — last resort when no send button is clickable
  const sendNearComposer = page
    .locator(
      '[data-testid="copilot-send-button"], [data-testid="concierge-chat-view-mounted"] .copilotKitInputControlButton, [data-testid="concierge-chat-view-mounted"] .copilotKitInput button:not([disabled])',
    )
    .first();
  if (await sendNearComposer.isVisible().catch(() => false)) {
    await expect(sendNearComposer).toBeEnabled({ timeout: 10_000 });
    await sendNearComposer.click();
    return;
  }

  const sendBesideInput = input
    .locator("xpath=ancestor::div[.//button][1]//button[not(@disabled)]")
    .last();
  if (await sendBesideInput.isVisible().catch(() => false)) {
    await sendBesideInput.click();
    return;
  }

  const controlSend = page.locator(".copilotKitInputControlButton").first();
  if (await controlSend.isVisible().catch(() => false)) {
    await expect(controlSend).toBeEnabled({ timeout: 10_000 });
    await controlSend.click();
    return;
  }

  const namedSend = page.getByRole("button", { name: /^send$/i });
  if (await namedSend.isVisible().catch(() => false)) {
    if (await namedSend.isEnabled().catch(() => false)) {
      await namedSend.click();
      return;
    }
  }

  await input.press("Enter");
}

/** How long an accepted submit has to make the app issue its own API request. */
export const CONCIERGE_ACCEPT_GRACE_MS = 6_000;

/**
 * The two effects `sendConciergeMessage` needs, as a seam so the retry contract
 * can be unit-tested deterministically — no browser, no timers, no network.
 *
 * `armReactionWatch` must be called *before* `submit`: an accepted submit makes
 * the app issue its request immediately, so a watch armed afterwards misses it.
 */
export type ConciergeSubmitPort = {
  armReactionWatch: (timeoutMs: number) => Promise<boolean>;
  submit: () => Promise<void>;
};

/**
 * Submit at most twice, and fail loudly if neither submit made the app react.
 *
 * On production the first submit after a page load can be silently discarded.
 * Measured against the live site, an **accepted** submit makes the app call its
 * own API within ~0ms — `/api/rentals/search`, `/api/events/search`,
 * `/api/grounded/search`, or `/api/copilotkit` — while a **discarded** submit
 * issues no request at all. That reaction is what decides whether to retry.
 *
 * This replaces an earlier "composer cleared" signal, which was measured to be
 * *never* true: the composer retains its text for minutes after a send that
 * demonstrably worked (cards rendered in 500ms). Gating on it made every query
 * look dropped, so every query was submitted twice, and a subsequent "throw on
 * the second attempt" turned a healthy product into a red smoke run.
 *
 * If the second submit also draws no reaction we must throw. Returning quietly
 * here would restore the failure mode this helper exists to remove: the caller
 * proceeds to assert on cards that were never requested, and the report blames
 * the product for a send the harness silently dropped.
 */
export async function submitConciergeMessageWithRetry(
  port: ConciergeSubmitPort,
  text: string,
  graceMs: number = CONCIERGE_ACCEPT_GRACE_MS,
): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const reacted = port.armReactionWatch(graceMs);
    await port.submit();
    if (await reacted) return;
  }
  throw new Error(
    `Concierge submit was not accepted after 2 attempts — the app issued no ` +
      `request, so the message was discarded before CopilotKit took it. ` +
      `Query: ${JSON.stringify(text)}`,
  );
}

/**
 * Resolve true once the page issues its own non-GET `/api/*` request, which is
 * the observable consequence of an accepted submit. Resolves false on timeout.
 */
function watchForAppApiRequest(
  page: Page,
  timeoutMs: number,
): Promise<boolean> {
  let origin: string;
  try {
    origin = new URL(page.url()).origin;
  } catch {
    return Promise.resolve(false);
  }
  return page
    .waitForRequest(
      (request) => {
        try {
          const url = new URL(request.url());
          return (
            url.origin === origin &&
            url.pathname.startsWith("/api/") &&
            request.method() !== "GET"
          );
        } catch {
          return false;
        }
      },
      { timeout: timeoutMs },
    )
    .then(() => true)
    .catch(() => false);
}

/** Type into the concierge composer and submit, retrying once (see above). */
export async function sendConciergeMessage(page: Page, text: string) {
  await submitConciergeMessageWithRetry(
    {
      armReactionWatch: (timeoutMs) => watchForAppApiRequest(page, timeoutMs),
      submit: () => submitConciergeMessageOnce(page, text),
    },
    text,
  );
}

export async function waitForRentalCards(page: Page) {
  const card = page.locator('[data-testid="rental-card"]').first();
  try {
    await card.waitFor({ state: "visible", timeout: 120_000 });
  } catch {
    await sendConciergeMessage(
      page,
      "Run search-rentals now for 1BR in Laureles under $80 per night.",
    );
    await card.waitFor({ state: "visible", timeout: 120_000 });
  }
}

export async function activateEventsChip(page: Page) {
  await page.getByRole("button", { name: /^events$/i }).click();
}

export async function sendEventQuery(page: Page, text = EVENT_QUERY) {
  await activateEventsChip(page);
  await sendConciergeMessage(page, text);
}

/** Wait for assistant prose without requiring event cards (F39 clarify path). */
export async function waitForAssistantReply(page: Page, timeout = 120_000) {
  await page
    .locator(".copilotKitMessage.copilotKitAssistantMessage")
    .last()
    .waitFor({ state: "visible", timeout });
}

export async function waitForNoEventCards(page: Page, settleMs = 8_000) {
  await page.waitForTimeout(settleMs);
  const count = await page.locator('[data-testid="event-card"]').count();
  if (count > 0) {
    throw new Error(`Expected no event cards, found ${count}`);
  }
}

export async function waitForGroundedCards(page: Page) {
  await page.locator('[data-testid="grounded-card"]').first().waitFor({
    state: "visible",
    timeout: 120_000,
  });
}

/** Café grounding cards — retry with explicit tool nudge on agent flake. */
export async function waitForCafeGroundedCards(page: Page) {
  const cafeCard = page
    .locator('[data-testid="grounded-card"][data-result-kind="cafe"]')
    .first();
  try {
    await cafeCard.waitFor({ state: "visible", timeout: 120_000 });
  } catch {
    await sendConciergeMessage(
      page,
      "Show me quiet cafés near Laureles with photos and ratings on the map.",
    );
    await cafeCard.waitFor({ state: "visible", timeout: 120_000 });
  }
}

const COPILOT_SEND_CONTROL =
  '[data-testid="copilot-chat-ready"], [data-testid="copilot-chat-request-in-progress"]';

/** Wait until CopilotKit finishes the current turn (streaming → idle). */
export async function waitForCopilotIdle(page: Page, timeout = 120_000) {
  await ensureChatInputVisible(page);
  const send = page.locator(COPILOT_SEND_CONTROL).first();
  try {
    await send.waitFor({ state: "attached", timeout: 30_000 });
  } catch {
    // Fast-path turns may skip CopilotKit progress attrs — idle = enabled composer.
    const input = page.locator(".copilotKitInput textarea").first();
    await input.waitFor({ state: "visible", timeout: 15_000 });
    await expect(input).toBeEnabled({ timeout });
    return;
  }
  await expect(send)
    .toHaveAttribute("data-copilotkit-in-progress", "true", { timeout: 15_000 })
    .catch(() => undefined);
  await expect(send).toHaveAttribute("data-copilotkit-in-progress", "false", {
    timeout,
  });
}

/** @deprecated Use waitForGroundedCards — café cards replace attribution footer. */
export async function waitForGroundingAttribution(page: Page) {
  await waitForGroundedCards(page);
}

export function collectCriticalConsoleErrors(errors: string[]): string[] {
  const allowed = [/favicon/i, /Download the React DevTools/i];
  const blocked = [
    /RefererNotAllowedMapError/i,
    /Maximum update depth exceeded/i,
    /Hydration failed/i,
  ];
  return errors.filter(
    (e) =>
      !allowed.some((p) => p.test(e)) &&
      (blocked.some((p) => p.test(e)) || /maps|google|copilot|error/i.test(e)),
  );
}

export async function waitForEventCards(page: Page) {
  const card = page.locator('[data-testid="event-card"]').first();
  try {
    await card.waitFor({ state: "visible", timeout: 120_000 });
  } catch {
    await sendConciergeMessage(
      page,
      "Call search-events for salsa events this weekend in Medellín and show ticketed events.",
    );
    await card.waitFor({ state: "visible", timeout: 120_000 });
  }
}

/** Event fast-path only — no agent nudge (avoids CopilotKit POST storm in budget e2e). */
export async function waitForEventCardsFastPath(page: Page, timeout = 90_000) {
  await page.locator('[data-testid="event-card"]').first().waitFor({
    state: "visible",
    timeout,
  });
}

export const RESTAURANT_FAST_PATH_QUERY = "suggest restaurants medellin";

/** Restaurant cards from fast-path panel (no CopilotKit tool render). */
export async function waitForRestaurantCards(page: Page) {
  const panel = page.locator('[data-testid="restaurant-fast-path-panel"]');
  const card = page.locator('[data-testid="restaurant-card"]').first();
  const waitForCards = async () => {
    await panel.waitFor({ state: "visible", timeout: 90_000 });
    await card.waitFor({ state: "visible", timeout: 30_000 });
  };
  try {
    await waitForCards();
  } catch {
    // Same recovery shape as waitForRentalCards/waitForEventCards. A fast-path
    // turn issues no CopilotKit request, so a dropped submit surfaces here as
    // missing cards rather than as an agent error. If this second attempt also
    // times out, the caller sees Playwright's own timeout, which says what was
    // missing — no local-dev advice that is meaningless against production.
    await sendConciergeMessage(page, RESTAURANT_FAST_PATH_QUERY);
    await waitForCards();
  }
}

/** Nightlife grounding cards — retry with explicit tool nudge on agent flake. */
export async function waitForNightlifeGroundedCards(page: Page) {
  const card = page
    .locator('[data-testid="nightlife-card"][data-result-kind="nightlife"]')
    .first();
  try {
    await card.waitFor({ state: "visible", timeout: 120_000 });
  } catch {
    await sendConciergeMessage(
      page,
      "Use search-grounded-places for salsa bars and rooftop cocktails in El Poblado with map pins.",
    );
    await card.waitFor({ state: "visible", timeout: 120_000 });
  }
}

export {
  RENTAL_QUERY,
  GROUNDING_QUERY,
  NIGHTLIFE_GROUNDING_QUERY,
  EVENT_QUERY,
};

/** Rich cards own the list — generic Map results strip must stay hidden. */
export async function assertNoGenericMapResultsList(page: Page) {
  await expect(page.locator('[data-testid="results-column"]')).toHaveCount(0);
}

/** Event cards live in chat only — panel is attribution-only. */
export async function assertSingleEventCardSurface(page: Page) {
  const chatCards = page.locator(
    '#copilot-chat-region [data-testid="event-card"]',
  );
  const panelCards = page.locator(
    '[data-testid="event-results-panel"] [data-testid="event-card"]',
  );
  await expect(chatCards.first()).toBeVisible();
  await expect(panelCards).toHaveCount(0);
}

export async function assertNoDuplicateGroundingLists(page: Page) {
  await expect(
    page.locator(
      '[data-testid="grounding-attribution"], [data-testid="grounding-attribution-compact"]',
    ),
  ).toHaveCount(0);
}
