import { expect, takeSnapshot, test } from "@chromatic-com/playwright";
import type { Page } from "@playwright/test";
import type { PublicEventTicket } from "@/lib/events/types";
import {
  EVENT_QUERY,
  RENTAL_QUERY,
  event,
  gotoDeterministicChat,
  mockFastPaths,
  typeAndSubmit,
  waitForPost,
} from "./helpers/deterministic-chat";

// Real MDE UI + isolated deterministic API fixtures. No live bookings, leads,
// ticket payments, or stored conversations. All snapshots are opt-in.
const prepareVisualPage = async (page: Page) => {
  await mockFastPaths(page);
  // The anonymous fast-path chat would otherwise POST to a real persistence
  // endpoint and receive a 401. Keep this UI-only test entirely read-only.
  await page.route("**/api/threads/*/messages", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const url = new URL(route.request().url());
    const data = route.request().postDataJSON() as { messages?: unknown[] } | null;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        threadId: url.pathname.split("/")[3],
        saved: 0, // simulated no-op, not proof of persistence
        requested: data?.messages?.length ?? 0,
        createdThread: false,
      }),
    });
  });
};

const mockEventDetails = async (page: Page, ticketTiers?: PublicEventTicket[]) => {
  // Match the public event-detail API contract with isolated visual fixtures.
  // The selected event and ticket prices are fake visual fixtures only.
  await page.route("**/api/events/*/public", async (route) => {
    const publicEvent = {
      id: event.id,
      slug: "deterministic-salsa-night",
      name: event.title,
      description: ticketTiers
        ? "Visual test fixture — simulated tickets only; no live inventory or payments."
        : "Visual test fixture — no live tickets available.",
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
      tickets: ticketTiers ?? [
        { id: "test-general", name: "General admission", priceCents: 1500, currency: "USD", qtyTotal: 50, qtySold: 0, position: 0 },
        { id: "test-vip", name: "VIP", priceCents: 3000, currency: "USD", qtyTotal: 20, qtySold: 0, position: 1 },
      ],
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ event: publicEvent }),
    });
  });
};

test.describe("MDE Chromatic mobile UI pilot", () => {
  test.skip(process.env.CHROMATIC_PILOT !== "1", "Chromatic pilot is opt-in");
  test.use({
    disableAutoSnapshot: true,
    cropToViewport: true,
    viewport: { width: 390, height: 844 },
  });

  test("Rental results and viewing controls stay clear of the floating map", async ({ page }, testInfo) => {
    await prepareVisualPage(page);
    await gotoDeterministicChat(page);
    await expect(page.getByTestId("copilot-chat-input")).toBeVisible();
    const response = waitForPost(page, "/api/rentals/search");
    await typeAndSubmit(page, RENTAL_QUERY);
    expect((await response).ok()).toBe(true);

    const card = page.getByTestId("rental-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Laureles");
    const schedule = page.getByTestId("rental-schedule-cta");
    const map = page.getByTestId("map-sheet-trigger");
    await expect(schedule).toBeVisible();
    await expect(map).toBeVisible();
    await takeSnapshot(page, "Rental results — 390px", testInfo);

    await schedule.click(); // normal click fails if an overlay intercepts it
    await expect(page.getByTestId("schedule-viewing-modal")).toBeVisible();
    await takeSnapshot(page, "Rental viewing modal — 390px", testInfo);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("schedule-viewing-modal")).toBeHidden();
    await map.click();
    await expect(page.getByTestId("map-sheet-content")).toBeVisible();
  });

  test("Event results and details remain usable on a phone", async ({ page }, testInfo) => {
    await prepareVisualPage(page);
    await mockEventDetails(page);
    await gotoDeterministicChat(page);
    const response = waitForPost(page, "/api/events/search");
    await typeAndSubmit(page, EVENT_QUERY);
    expect((await response).ok()).toBe(true);

    const card = page.getByTestId("event-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Deterministic Salsa Night");
    await takeSnapshot(page, "Event results — 390px", testInfo);

    await page.getByTestId("event-details-cta").click();
    const sheet = page.getByTestId("venue-detail-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("event-sheet-venue")).toContainText("Test venue");
    await takeSnapshot(page, "Event details — 390px", testInfo);
  });

  test("General Admission picker caps at 10 and shows COP 400,000 without payment", async ({ page }, testInfo) => {
    await prepareVisualPage(page);
    // Override the generic search fixture for this single scenario. The real
    // event sheet only exposes its ticket action when the search result says
    // tickets are actually purchasable.
    await page.route("**/api/events/search", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [{
          ...event,
          pricePerTicket: 40_000,
          currency: "COP",
          canBuyTickets: true,
          ticketUrl: `/events/${event.id}`,
        }],
        total: 1,
        source: "mock",
      }),
    }));

    // Fixed, source-shaped visual fixture: this test must never use live
    // inventory or create an actual order while comparing visual snapshots.
    await mockEventDetails(page, [{
      id: "test-general-admission",
      name: "General Admission",
      priceCents: 4_000_000, // stored cents: COP 40,000 per ticket
      currency: "COP",
      qtyTotal: 30,
      qtySold: 2,
      qtyPending: 1,
      minPerOrder: 1,
      maxPerOrder: 10,
      saleStartsAt: null,
      saleEndsAt: null,
      position: 0,
    }]);

    const checkoutRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/tickets\/checkout|\/functions\/v1\/ticket-checkout|checkout\.stripe\.com/.test(request.url())) {
        checkoutRequests.push(request.url());
      }
    });
    // Fail closed if an unexpected UI action tries to submit an order.
    await page.route(/\/api\/tickets\/checkout|\/functions\/v1\/ticket-checkout|checkout\.stripe\.com/, (route) => route.abort());

    await gotoDeterministicChat(page);
    const response = waitForPost(page, "/api/events/search");
    await typeAndSubmit(page, EVENT_QUERY);
    expect((await response).ok()).toBe(true);
    await expect(page.getByTestId("event-card")).toHaveCount(1);

    await page.getByTestId("event-details-cta").click();
    const sheet = page.getByTestId("venue-detail-sheet");
    await expect(sheet.getByTestId("venue-detail-buy-cta")).toBeVisible();
    await sheet.getByTestId("venue-detail-buy-cta").click();

    const ga = sheet.getByTestId("event-tier-row").filter({ hasText: "General Admission" });
    const quantity = ga.getByTestId("event-tier-qty");
    const increase = ga.getByRole("button", { name: "Increase General Admission quantity" });
    await expect(quantity).toHaveText("1");
    for (let i = 1; i < 10; i += 1) await increase.click();
    await expect(quantity).toHaveText("10");
    await expect(increase).toBeDisabled();
    await expect(ga.getByTestId("event-tier-order-cap")).toContainText("Up to 10 tickets per order");

    const review = sheet.getByTestId("event-sheet-checkout-cta");
    await expect(review).toBeEnabled();
    await expect(review).toContainText(/General Admission × 10/);
    await expect(review).toContainText(/400,000 COP/);
    await takeSnapshot(page, "Event ticket picker — GA 10 × COP 40,000 — mobile 390px", testInfo);

    // Intentionally NEVER click the checkout CTA: review is display-only here.
    await expect(page.getByTestId("booking-checkout-modal")).toHaveCount(0);
    expect(checkoutRequests).toEqual([]);
  });
});
