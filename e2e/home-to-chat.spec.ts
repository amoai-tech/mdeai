import { test, expect } from "@playwright/test";
import {
  assertConciergeShellVisible,
  ensureChatInputVisible,
  gotoMarketingHome,
  hideCopilotWebInspector,
  submitHomeHeroQuery,
  waitForCafeGroundedCards,
  waitForCopilotIdle,
  waitForCopilotRuntime,
  waitForHomeEventHandoff,
  waitForHomeToChatHandoff,
  waitForMapPinsUpdated,
  waitForRentalCards,
  waitForRestaurantCards,
} from "./helpers/maps-layout";

const HOME_VIEWPORT = { width: 1360, height: 900 } as const;

const VERTICAL_CASES = [
  {
    query: "fashion events in medellin",
    waitForResults: waitForHomeEventHandoff,
    cardSelector: '[data-testid="event-card"]',
    requireCards: false,
    requireMapPins: false,
  },
  {
    query: "apartments in laureles",
    waitForResults: waitForRentalCards,
    cardSelector: '[data-testid="rental-card"]',
    requireCards: true,
    requireMapPins: true,
  },
  {
    query: "best restaurants in poblado",
    waitForResults: waitForRestaurantCards,
    cardSelector: '[data-testid="restaurant-card"]',
    requireCards: true,
    requireMapPins: true,
  },
] as const;

/** SAN-1356 exact regression: homepage query with typo + explicit count. */
const SAN1356_QUERY = "search top 5 rentals laureless";

test.describe("Home → Chat launch (SAN-733)", () => {
  test.use({ viewport: HOME_VIEWPORT });

  test("hero search: cafes auto-send, cards, map, URL /chat", async ({ page }) => {
    test.setTimeout(180_000);

    await gotoMarketingHome(page);
    await submitHomeHeroQuery(page, "suggest cafes in medellin");

    await waitForHomeToChatHandoff(page, "suggest cafes in medellin");
    await assertConciergeShellVisible(page);

    await waitForCafeGroundedCards(page);
    expect(
      await page.locator('[data-testid="grounded-card"]').count(),
    ).toBeGreaterThan(0);
    await waitForMapPinsUpdated(page);
    await waitForCopilotIdle(page);

    await ensureChatInputVisible(page);
    await expect(page.getByRole("button", { name: /^send$/i })).toBeVisible();
    expect(page.url()).toMatch(/\/chat$/);
    expect(page.url()).not.toContain("?q=");
  });

  test("FAB opens GeoChatShell at /chat without auto-send", async ({ page }) => {
    test.setTimeout(60_000);

    await gotoMarketingHome(page);
    await page.getByTestId("home-fab-chat").click();

    await page.waitForURL(/\/chat$/, { timeout: 20_000 });
    await page
      .locator('[data-testid="chat-canvas"]')
      .waitFor({ state: "visible", timeout: 20_000 });
    await hideCopilotWebInspector(page);
    await waitForCopilotRuntime(page);
    await assertConciergeShellVisible(page);

    const userMessages = page.locator(
      ".copilotKitMessage.copilotKitUserMessage",
    );
    expect(await userMessages.count()).toBe(0);
  });
});

test.describe("Home → Chat vertical handoffs", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: HOME_VIEWPORT });

  for (const {
    query,
    waitForResults,
    cardSelector,
    requireCards,
    requireMapPins,
  } of VERTICAL_CASES) {
    test(`hero → /chat: ${query}`, async ({ page }) => {
      test.setTimeout(180_000);

      await gotoMarketingHome(page);
      await submitHomeHeroQuery(page, query);

      await waitForHomeToChatHandoff(page, query);
      await assertConciergeShellVisible(page);
      await waitForResults(page);

      const cardCount = await page.locator(cardSelector).count();
      if (requireCards) {
        expect(cardCount).toBeGreaterThan(0);
      } else {
        expect(cardCount).toBeGreaterThanOrEqual(0);
      }
      if (requireMapPins) {
        await waitForMapPinsUpdated(page);
      }
      await waitForCopilotIdle(page);
      await ensureChatInputVisible(page);

      const region = page.locator('[data-testid="copilot-chat-region"]');
      await expect(region.getByText(query, { exact: true })).toHaveCount(1);
      expect(page.url()).toMatch(/\/chat$/);
    });
  }
});

test.describe("SAN-1356: Homepage rental search exact regression", () => {
  test.use({ viewport: HOME_VIEWPORT });

  test("hero search: 'search top 5 rentals laureless' → Laureles + limit 5 + cards + map", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await gotoMarketingHome(page);
    await submitHomeHeroQuery(page, SAN1356_QUERY);

    // Verify handoff to /chat with query stripped
    await waitForHomeToChatHandoff(page, SAN1356_QUERY);
    await assertConciergeShellVisible(page);

    // Verify rental cards render (max 5 due to explicit "top 5")
    await waitForRentalCards(page);
    const rentalCards = page.locator('[data-testid="rental-card"]');
    const cardCount = await rentalCards.count();
    expect(cardCount).toBeGreaterThan(0);
    expect(cardCount).toBeLessThanOrEqual(5);

    // Verify map pins render
    await waitForMapPinsUpdated(page);

    // Verify neighborhood normalization: laureless → Laureles in results
    const firstCard = rentalCards.first();
    await expect(firstCard).toContainText("Laureles");

    // Verify URL is clean (no ?q=)
    await waitForCopilotIdle(page);
    await ensureChatInputVisible(page);
    expect(page.url()).toMatch(/\/chat$/);
    expect(page.url()).not.toContain("?q=");
  });

  test("repeat submission has identical semantics (no genericAskPending drift)", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await gotoMarketingHome(page);
    await submitHomeHeroQuery(page, SAN1356_QUERY);

    await waitForHomeToChatHandoff(page, SAN1356_QUERY);
    await assertConciergeShellVisible(page);
    await waitForRentalCards(page);

    const firstCardCount = await page.locator('[data-testid="rental-card"]').count();

    // Submit the same query again via chat input
    await ensureChatInputVisible(page);
    const input = page
      .locator('.copilotKitInput textarea, [role="textbox"][placeholder*="message" i]')
      .first();
    await input.click();
    await input.fill(SAN1356_QUERY);
    await page.getByRole("button", { name: /^send$/i }).click();

    await waitForRentalCards(page);
    const secondCardCount = await page.locator('[data-testid="rental-card"]').count();

    // Semantics should be identical: same neighborhood, same limit
    expect(secondCardCount).toBe(firstCardCount);
    expect(secondCardCount).toBeLessThanOrEqual(5);
  });
});
