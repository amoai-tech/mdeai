import { expect, takeSnapshot, test } from "@chromatic-com/playwright";
import type { Page } from "@playwright/test";
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

const mockEventDetails = async (page: Page) => {
  // Match the existing Argos test's public event-detail API contract.
  // The selected event and ticket prices are fake visual fixtures only.
  await page.route("**/api/events/*/public", async (route) => {
    const publicEvent = {
      id: event.id,
      slug: "deterministic-salsa-night",
      name: event.title,
      description: "Visual test fixture — no live tickets available.",
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
});
