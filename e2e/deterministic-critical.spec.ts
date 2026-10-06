import { test, expect } from "@playwright/test";
import {
  gotoMarketingHome,
  submitHomeHeroQuery,
} from "./helpers/maps-layout";
import {
  RENTAL_QUERY,
  RESTAURANT_QUERY,
  chooseRestaurantFilter,
  gotoDeterministicChat,
  mockFastPaths,
  rental,
  typeAndSubmit,
  waitForPost,
} from "./helpers/deterministic-chat";

test.describe("SAN-1341 deterministic critical journeys", { tag: ["@critical", "@deterministic"] }, () => {
  test.beforeEach(async ({ page }) => {
    await mockFastPaths(page);
  });

  test("Home → Chat sends one restaurant query and renders mocked results", async ({
    page,
  }) => {
    const query = RESTAURANT_QUERY;
    let calls = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/restaurants/search")) calls += 1;
    });

    await gotoMarketingHome(page);
    await submitHomeHeroQuery(page, query);
    await expect(page).toHaveURL((url) => url.pathname === "/chat");
    await expect(page.getByText(query, { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("restaurant-clarify")).toBeVisible();
    await chooseRestaurantFilter(page);

    await expect(page.getByTestId("restaurant-card")).toHaveCount(1);
    expect(calls).toBe(1);
  });

  test("restaurant fast path renders restaurant cards without event cards", async ({
    page,
  }) => {
    await gotoDeterministicChat(page);
    await typeAndSubmit(page, RESTAURANT_QUERY);
    await expect(page.getByTestId("restaurant-clarify")).toBeVisible();
    await chooseRestaurantFilter(page);

    await expect(page.getByTestId("restaurant-card")).toHaveCount(1);
    await expect(page.getByTestId("event-card")).toHaveCount(0);
    await expect(page.getByTestId("restaurant-fast-path-panel")).toBeVisible();
  });

  test("rental fast path renders rental card and map pin state", async ({
    page,
  }) => {
    await gotoDeterministicChat(page);
    const responsePromise = waitForPost(page, "/api/rentals/search");
    await typeAndSubmit(page, RENTAL_QUERY);
    expect((await responsePromise).ok()).toBe(true);

    await expect(page.getByTestId("rental-card")).toHaveCount(1);
    await expect(page.getByTestId("rental-card").first()).toContainText(
      "Laureles",
    );
    await expect(page.getByTestId("map-pin").first()).toBeVisible();
    // SAN-1349 control: the fixture is owned + approved + published, so the CHAT card must
    // expose the viewing action. Paired with the unowned case below, this pins both directions
    // of the requestability contract on the chat surface.
    await expect(page.getByTestId("rental-schedule-cta")).toHaveCount(1);
  });

  // SAN-1349: an unowned / non-requestable listing stays browseable but must never expose a
  // viewing action, so the UI cannot advertise something the database would reject.
  test("unowned rental renders a card without a Schedule viewing CTA", async ({
    page,
  }) => {
    await page.route("**/api/rentals/search", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              ...rental,
              can_schedule_viewing: false,
              schedule_viewing_url: null,
            },
          ],
          total: 1,
          source: "mock",
        }),
      });
    });

    await gotoDeterministicChat(page);
    const responsePromise = waitForPost(page, "/api/rentals/search");
    await typeAndSubmit(page, RENTAL_QUERY);
    expect((await responsePromise).ok()).toBe(true);

    await expect(page.getByTestId("rental-card")).toHaveCount(1);
    await expect(page.getByTestId("rental-schedule-cta")).toHaveCount(0);
  });
});
