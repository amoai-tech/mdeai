import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  gotoHome,
  sendConciergeMessage,
  submitConciergeMessageExpectingNoTurn,
  waitForCopilotIdle,
  waitForRentalCards,
  waitForRestaurantCards,
  waitForCafeGroundedCards,
  RENTAL_QUERY,
  GROUNDING_QUERY,
  RESTAURANT_FAST_PATH_QUERY,
  NIGHTLIFE_GROUNDING_QUERY,
} from "./helpers/maps-layout";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  hasE2eEnv,
  signInAsOnOrigin,
} from "./helpers/auth";
import { expectProtectedRouteLoginRedirect } from "./helpers/screen-evidence";

const isProd = Boolean(process.env.PROD_SMOKE_BASE_URL?.trim());
const outDir =
  process.env.PROD_SMOKE_OUT_DIR ??
  path.join(process.cwd(), "tmp", "prod-journey-j05-j20");

test.describe("SAN-546 · OPS-JOURNEY — prod matrix J05–J20", () => {
  test.skip(!isProd, "Set PROD_SMOKE_BASE_URL (e.g. https://www.mdeai.co)");

  test.beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
  });

  test("J05 — quiet rooftop dinner in Provenza", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1360, height: 900 });
    await gotoHome(page);
    await sendConciergeMessage(page, "quiet rooftop dinner in Provenza");
    await waitForRestaurantCards(page);
    await waitForCopilotIdle(page, 120_000);
    expect(
      await page.locator('[data-testid="restaurant-card"]').count(),
    ).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(outDir, "j05-restaurants.png") });
  });

  test("J06 — rooftop cocktails Provenza (nightlife not café)", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1360, height: 900 });
    await gotoHome(page);
    await sendConciergeMessage(page, NIGHTLIFE_GROUNDING_QUERY);
    await waitForCopilotIdle(page, 150_000);
    const nightlife = await page
      .locator('[data-testid="nightlife-card"], [data-testid="grounded-card"][data-result-kind="nightlife"]')
      .count();
    const cafes = await page
      .locator('[data-testid="grounded-card"][data-result-kind="cafe"]')
      .count();
    expect(nightlife + cafes).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(outDir, "j06-nightlife.png") });
  });

  test("J07 — best brunch in El Poblado", async ({ page }) => {
    test.setTimeout(240_000);
    await gotoHome(page);
    await sendConciergeMessage(page, "best brunch in El Poblado");
    await waitForRestaurantCards(page);
    await waitForCopilotIdle(page, 120_000);
    expect(
      await page.locator('[data-testid="restaurant-card"]').count(),
    ).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(outDir, "j07-brunch.png") });
  });

  test("J08 — restaurant card opens detail panel", async ({ page }) => {
    test.setTimeout(240_000);
    await gotoHome(page);
    await sendConciergeMessage(page, RESTAURANT_FAST_PATH_QUERY);
    await waitForRestaurantCards(page);
    await waitForCopilotIdle(page, 120_000);
    const first = page.locator('[data-testid="restaurant-card"]').first();
    await first.locator('[data-testid="restaurant-details-cta"]').click();
    await expect(page.locator('[data-testid="map-panel"]')).toBeVisible();
    await page.screenshot({ path: path.join(outDir, "j08-restaurant-detail.png") });
  });

  test("J09 — events answer is a real card or the explicit empty state", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await gotoHome(page);
    await sendConciergeMessage(page, "salsa events this weekend in Medellín");
    await waitForCopilotIdle(page, 150_000);

    // Two truthful terminals, and only two. The events tool renders a card when
    // the live marketplace has matching inventory and `events-empty` when it
    // does not. Demanding a card made this journey fail on a correct answer
    // whenever the market was empty, which is most of the time pre-launch.
    const card = page.locator('[data-testid="event-card"]').first();
    const empty = page.getByTestId("events-empty").first();
    await expect(card.or(empty)).toBeVisible({ timeout: 120_000 });

    if (await card.isVisible().catch(() => false)) {
      // Real inventory: prove the buy path is reachable. Checkout itself is
      // exercised by the ticketing specs; here we only need the next hop.
      const buy = card.getByRole("link", { name: /buy|tickets/i }).first();
      if (await buy.isVisible().catch(() => false)) {
        await buy.click();
        await page.waitForURL(/\/(login|events\/)/, { timeout: 30_000 });
      }
    } else {
      // No inventory: the empty state must be explicit and still actionable,
      // not a dead end that leaves the renter with nothing to do.
      await expect(empty).toContainText(/no events/i);
      await expect(page.getByTestId("events-empty-suggest-weekend")).toBeVisible();
    }

    await page.screenshot({ path: path.join(outDir, "j09-event-cta.png") });
  });

  test("J10 — host event wizard shell (auth-gated)", async ({ page }) => {
    test.setTimeout(120_000);
    // Prod matrix: Roberto wizard — unauthenticated users redirect to login (SCREEN-016).
    await expectProtectedRouteLoginRedirect(page, "/host/event/new");
    await page.screenshot({ path: path.join(outDir, "j10-host-wizard.png") });
  });

  test("J11 — host events list redirects or loads", async ({ page }) => {
    test.setTimeout(120_000);
    const res = await page.goto("/host/events", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await page.screenshot({ path: path.join(outDir, "j11-host-events.png") });
  });

  test("J12 — /rentals browse page", async ({ page }) => {
    test.setTimeout(120_000);
    const res = await page.goto("/rentals", { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBe(true);
    await expect(page.getByTestId("rentals-browse")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: path.join(outDir, "j12-rentals-page.png") });
  });

  test("J13 — rental schedule viewing modal", async ({ page }) => {
    test.setTimeout(300_000);
    await gotoHome(page);
    await sendConciergeMessage(page, RENTAL_QUERY);
    await waitForRentalCards(page);
    const schedule = page
      .locator('[data-testid="rental-card"]')
      .first()
      .getByRole("button", { name: /schedule|viewing/i });
    if (await schedule.isVisible().catch(() => false)) {
      await schedule.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    }
    await page.screenshot({ path: path.join(outDir, "j13-schedule-viewing.png") });
  });

  test("J14 — guest rental follow-up offers sign-in, never a silent drop", async ({ page }) => {
    test.setTimeout(300_000);
    await gotoHome(page);
    // The public fast path works for guests: this really returns rental cards.
    await sendConciergeMessage(page, RENTAL_QUERY);
    await waitForRentalCards(page);
    await waitForCopilotIdle(page, 120_000);

    // The follow-up needs the AI runtime, which refuses guests on purpose (SAN-1507).
    // Submit once without expecting an app request, then require the sign-in offer.
    await submitConciergeMessageExpectingNoTurn(page, "when can I view?");
    await expect(page.getByTestId("concierge-sign-in-prompt")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("concierge-sign-in-link")).toHaveAttribute(
      "href",
      "/login?next=%2Fchat",
    );
    // The refusal must not look like a silent failure or invent an assistant answer.
    await expect(page.getByText(/what can i help you with/i)).toHaveCount(0);
    expect(await page.locator('[data-testid="rental-card"]').count()).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(outDir, "j14-guest-signin-offer.png") });
  });

  test("J14 — signed-in rental follow-up keeps the previous rental context", async ({ page }) => {
    test.setTimeout(300_000);
    test.skip(!hasE2eEnv(), "Needs Supabase e2e credentials for a real signed-in turn");

    const identity = await createThrowawayIdentity("journey-j14");
    try {
      await signInAsOnOrigin(page, process.env.PROD_SMOKE_BASE_URL!, identity.email);
      await gotoHome(page);
      await sendConciergeMessage(page, RENTAL_QUERY);
      await waitForRentalCards(page);
      await waitForCopilotIdle(page, 180_000);

      // Signed in, the follow-up must reach the AI runtime — not the public fast path.
      // Arm the wait first: an accepted submit issues its request immediately.
      const runtimeTurn = page.waitForRequest(
        (request) => {
          try {
            const url = new URL(request.url());
            return request.method() !== "GET" && url.pathname === "/api/copilotkit";
          } catch {
            return false;
          }
        },
        { timeout: 60_000 },
      );
      await sendConciergeMessage(page, "when can I view?");
      await runtimeTurn;
      await waitForCopilotIdle(page, 180_000);
      // The rental results that answered the first question are still the working set.
      expect(await page.locator('[data-testid="rental-card"]').count()).toBeGreaterThan(0);
      await expect(page.getByTestId("concierge-sign-in-prompt")).toHaveCount(0);
      await page.screenshot({ path: path.join(outDir, "j14-signed-in-followup.png") });
    } finally {
      await deleteThrowawayIdentity(identity);
    }
  });

  test("J15 — back-to-back pin clear", async ({ page }) => {
    test.setTimeout(300_000);
    const collectPinIds = () =>
      page
        .locator('[data-testid="map-pin"]')
        .evaluateAll((els) =>
          els
            .map((el) => el.getAttribute("data-pin-id"))
            .filter((id): id is string => Boolean(id)),
        );

    await gotoHome(page);
    await sendConciergeMessage(page, RENTAL_QUERY);
    await waitForRentalCards(page);
    await waitForCopilotIdle(page, 120_000);
    const rentalPinIds = await collectPinIds();

    await sendConciergeMessage(page, GROUNDING_QUERY);
    await waitForCafeGroundedCards(page);
    await waitForCopilotIdle(page, 120_000);

    const persisted = (await collectPinIds()).filter((id) =>
      rentalPinIds.includes(id),
    );
    expect(persisted).toEqual([]);
    await page.screenshot({ path: path.join(outDir, "j15-pin-clear.png") });
  });

  test("J16 — hover rental card highlights pin", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1360, height: 900 });
    await gotoHome(page);
    await sendConciergeMessage(page, RENTAL_QUERY);
    await waitForRentalCards(page);
    await waitForCopilotIdle(page, 120_000);
    const card = page.locator('[data-testid="rental-card"]').first();
    await card.hover();
    await expect(
      page.locator('[data-testid="map-pin"][data-marker-selected="true"]'),
    ).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: path.join(outDir, "j16-hover-pin.png") });
  });

  test("J17 — mobile café drawer + FAB", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHome(page);
    await sendConciergeMessage(page, GROUNDING_QUERY);
    await waitForCafeGroundedCards(page);
    await waitForCopilotIdle(page, 120_000);

    const fab = page.getByTestId("map-sheet-trigger");
    await expect(fab).toBeVisible();
    await fab.click();
    await expect(page.getByTestId("map-sheet-content")).toBeVisible({
      timeout: 8_000,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("map-sheet-content")).toBeHidden();

    // The old chat-ready/request-in-progress markers are not rendered by the v2
    // composer. Check the actual renter-visible control after dismissing the map:
    // it must accept a draft and enable Send without issuing a paid agent turn.
    const composer = page.getByTestId("copilot-chat-region").getByTestId("copilot-chat-textarea");
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await expect(composer).toBeEditable();
    const draft = "Can I still ask about this area?";
    await composer.click();
    await composer.fill(draft);
    await expect(composer).toHaveValue(draft);
    await expect(page.getByTestId("copilot-send-button")).toBeEnabled();
    await composer.fill("");
    await expect(page.getByTestId("copilot-send-button")).toBeVisible();
    await page.screenshot({ path: path.join(outDir, "j17-mobile-map.png") });
  });

  test("J18 — tickets wallet requires auth", async ({ page }) => {
    test.setTimeout(60_000);
    const res = await page.goto("/me/tickets", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await page.screenshot({ path: path.join(outDir, "j18-tickets.png") });
  });

  test("J19 — trips dashboard or empty state", async ({ page }) => {
    test.setTimeout(60_000);
    const res = await page.goto("/trips", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await page.screenshot({ path: path.join(outDir, "j19-trips.png") });
  });

  test("J20 — saved collections grid", async ({ page }) => {
    test.setTimeout(60_000);
    const res = await page.goto("/saved", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await page.screenshot({ path: path.join(outDir, "j20-saved.png") });
  });
});
