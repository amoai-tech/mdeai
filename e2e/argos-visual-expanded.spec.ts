import { expect, test, type Page } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";
import {
  EVENT_QUERY,
  RENTAL_QUERY,
  event,
  gotoDeterministicChat,
  mockFastPaths,
  rental,
  typeAndSubmit,
  waitForPost,
} from "./helpers/deterministic-chat";

// Visual fixtures run in the real MDE UI with the repository's existing deterministic
// API seam. No live Supabase, private conversations, ticket purchases or booking writes.
// NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT=1 is required when launching the Next.js test server.
const MOBILE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1440, height: 900 };

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(2);
}

async function openChat(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport); // Resize BEFORE navigation/hydration.
  await mockFastPaths(page);
  await gotoDeterministicChat(page);
  await expect(page.getByTestId("copilot-chat-input")).toBeVisible();
  await noHorizontalOverflow(page);
}

async function search(page: Page, query: string, endpoint: string) {
  const response = waitForPost(page, endpoint);
  await typeAndSubmit(page, query);
  expect((await response).status()).toBe(200);
}

const ticketFixture = {
  id: event.id,
  slug: "deterministic-salsa-night",
  name: event.title,
  description: "Deterministic UI fixture — no live tickets are for sale.",
  address: "Test venue",
  city: "Medellín",
  startsAt: event.startsAt,
  endsAt: null,
  imageUrl: null,
  currency: "USD",
  latitude: event.latitude,
  longitude: event.longitude,
  host: null,
  venue: null,
  facts: null,
  tickets: [
    { id: "test-general", name: "General admission", priceCents: 1500, currency: "USD", qtyTotal: 50, qtySold: 0, position: 0 },
    { id: "test-vip", name: "VIP", priceCents: 3000, currency: "USD", qtyTotal: 20, qtySold: 2, position: 1 },
  ],
};

// The existing venue-detail sheet requests this exact public API. Only that
// browser request is intercepted; the sheet/ticket-picker are real app components.
async function mockPublicEventDetail(page: Page) {
  await page.route("**/api/events/*/public", async (route) => {
    expect(new URL(route.request().url()).pathname).toBe(
      `/api/events/${event.id}/public`,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ event: ticketFixture }),
    });
  });
  // The search fixture is already deterministic; supply explicit test-only
  // ticket authority so the real Buy control can open the local picker.
  await page.route("**/api/events/search", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [{ ...event, canBuyTickets: true, ticketUrl: `/events/${event.id}` }],
        total: 1,
        source: "mock",
      }),
    }),
  );
}

test.describe("Argos expanded visual regression — read-only MDE journeys", () => {
  for (const [device, viewport] of [
    ["mobile-390", MOBILE],
    ["tablet-768", TABLET],
    ["desktop-1440", DESKTOP],
  ] as const) {
    test(`rental cards, concierge and map — ${device}`, async ({ page }) => {
      await openChat(page, viewport);
      if (device !== "tablet-768") await argosScreenshot(page, `concierge-idle-${device}`);

      await search(page, RENTAL_QUERY, "/api/rentals/search");
      const card = page.getByTestId("rental-card");
      await expect(card).toHaveCount(1);
      await expect(card).toContainText("Laureles");
      await expect(card).toContainText("55");
      await expect(card).toHaveAttribute("data-pin-id", /.+/);
      await noHorizontalOverflow(page);
      await argosScreenshot(page, `concierge-rental-results-${device}`);
      if (device !== "tablet-768") await argosScreenshot(page, `rental-card-${device}`, { element: card, ariaSnapshot: device === "desktop-1440" });

      if (device === "desktop-1440") {
        const pinId = await card.getAttribute("data-pin-id");
        expect(pinId).toBeTruthy();
        await expect(page.locator(`[data-testid="map-pin"][data-pin-id="${pinId}"]`)).toBeVisible();
        await page.getByTestId("rental-details-cta").click();
        const details = page.getByTestId("rental-details-panel");
        await expect(details).toBeVisible();
        await expect(details).toHaveAttribute("data-listing-id", rental.id);
        await argosScreenshot(page, "rental-details-desktop-1440", { element: details });
      } else {
        const trigger = page.getByTestId("map-sheet-trigger");
        await expect(trigger).toBeVisible();
        await trigger.click();
        const sheet = page.getByTestId("map-sheet-content");
        await expect(sheet).toBeVisible();
        await expect(sheet.getByTestId("map-pin")).toHaveCount(1);
        await argosScreenshot(page, `rental-map-sheet-${device}`);
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
      }
    });
  }

  for (const [device, viewport] of [
    ["mobile-390", MOBILE],
    ["desktop-1440", DESKTOP],
  ] as const) {
    test(`event result and real ticket picker — ${device}`, async ({ page }) => {
      await openChat(page, viewport);
      await mockPublicEventDetail(page);
      await search(page, EVENT_QUERY, "/api/events/search");
      const card = page.getByTestId("event-card");
      await expect(card).toHaveCount(1);
      await expect(card).toContainText("Deterministic Salsa Night");
      await expect(card).toContainText("15");
      await noHorizontalOverflow(page);
      await argosScreenshot(page, `concierge-event-results-${device}`);
      await argosScreenshot(page, `event-card-${device}`, { element: card });

      const detailsAction = page.getByTestId("event-details-cta");
      if (device === "mobile-390") {
        const actionBox = await detailsAction.boundingBox();
        const mapBox = await page.getByTestId("map-sheet-trigger").boundingBox();
        expect(actionBox && mapBox && (
          actionBox.y + actionBox.height <= mapBox.y || actionBox.y >= mapBox.y + mapBox.height ||
          actionBox.x + actionBox.width <= mapBox.x || actionBox.x >= mapBox.x + mapBox.width
        ), "Map control must never cover the event Details action").toBe(true);
      }
      await detailsAction.click({ timeout: 10_000 });
      const sheet = page.getByTestId("venue-detail-sheet");
      await expect(sheet).toBeVisible();
      await expect(sheet.getByTestId("event-sheet-venue")).toContainText("Test venue");
      await argosScreenshot(page, `event-detail-sheet-${device}`, { element: sheet });

      await sheet.getByTestId("venue-detail-buy-cta").click();
      const tierList = sheet.getByTestId("event-tier-list");
      await expect(tierList.getByTestId("event-tier-row")).toHaveCount(2);
      await expect(tierList).toContainText("General admission");
      await expect(tierList).toContainText("VIP");
      await argosScreenshot(page, `event-ticket-tiers-${device}`, { element: sheet, ariaSnapshot: device === "desktop-1440" });
    });
  }

  for (const [device, viewport] of [
    ["mobile-390", MOBILE],
    ["desktop-1440", DESKTOP],
  ] as const) {
    test(`empty rental and event result cards — ${device}`, async ({ page }) => {
      await openChat(page, viewport);
      await page.route("**/api/rentals/search", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [], total: 0, source: "mock" }) }),
      );
      await search(page, RENTAL_QUERY, "/api/rentals/search");
      await expect(page.getByTestId("rental-card")).toHaveCount(0);
      await expect(page.getByTestId("rentals-empty")).toBeVisible();
      await argosScreenshot(page, `concierge-rental-empty-${device}`);

      await page.route("**/api/events/search", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [], total: 0, source: "mock" }) }),
      );
      await search(page, EVENT_QUERY, "/api/events/search");
      await expect(page.getByTestId("event-card")).toHaveCount(0);
      await expect(page.getByTestId("events-empty")).toBeVisible();
      await argosScreenshot(page, `concierge-event-empty-${device}`);
    });
  }

  test("event search loading, recoverable error and retry on mobile", async ({ page }) => {
    await openChat(page, MOBILE);
    let requests = 0;
    let releaseFirst!: () => void;
    const pending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    await page.route("**/api/events/search", async (route) => {
      requests += 1;
      if (requests === 1) {
        await pending;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporarily unavailable" }) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [event], total: 1, source: "mock" }) });
      }
    });

    await typeAndSubmit(page, EVENT_QUERY);
    try {
      await expect(page.getByTestId("copilot-send-button")).toHaveText("Sending…");
      await argosScreenshot(page, "concierge-event-loading-mobile-390");
    } finally {
      releaseFirst();
    }
    const retry = page.getByTestId("concierge-run-feedback").getByRole("button", { name: /try again/i });
    await expect(retry).toBeVisible();
    await argosScreenshot(page, "concierge-event-error-mobile-390");
    await retry.click();
    await expect(page.getByTestId("event-card")).toHaveCount(1);
    expect(requests).toBe(2);
    await argosScreenshot(page, "concierge-event-recovered-mobile-390");
  });

  for (const [device, viewport] of [
    ["mobile-390", MOBILE],
    ["tablet-768", TABLET],
    ["desktop-1440", DESKTOP],
  ] as const) {
    test(`public rentals and events browse fallback — ${device}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const rentals = await page.goto("/rentals");
      expect(rentals?.status()).toBe(200);
      await expect(page.getByTestId("rentals-browse")).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () =>
        await page.locator('[data-testid="rentals-grid"],[data-testid="rentals-empty"],[data-testid="rentals-error"]').count(),
      ).toBe(1);
      await noHorizontalOverflow(page);
      await argosScreenshot(page, `rentals-browse-fallback-${device}`);

      const events = await page.goto("/events");
      expect(events?.status()).toBe(200);
      await expect(page.getByTestId("events-browse")).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () =>
        await page.locator('[data-testid="events-grid"],[data-testid="events-empty"],[data-testid="events-error"]').count(),
      ).toBe(1);
      await noHorizontalOverflow(page);
      await argosScreenshot(page, `events-browse-fallback-${device}`);
    });
  }

  test("320px small-phone composer stays inside viewport", async ({ page }) => {
    await openChat(page, { width: 320, height: 640 });
    await argosScreenshot(page, "concierge-idle-mobile-320");
    await search(page, RENTAL_QUERY, "/api/rentals/search");
    await expect(page.getByTestId("rental-card")).toHaveCount(1);
    await noHorizontalOverflow(page);
    await argosScreenshot(page, "concierge-rental-results-mobile-320");
  });
});
