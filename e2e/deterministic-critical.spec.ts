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

  test("shared fast-path mocks intercept the nav rail thread fetch without Supabase", async ({ page }) => {
    // Prove the fixture itself supplied this response. A 200 from an external
    // service (or a quiet catch in useNavThreads) must not satisfy this test.
    const threadResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/threads" &&
      response.request().method() === "GET",
    );
    await gotoDeterministicChat(page);
    const response = await threadResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()["x-mde-e2e-fixture"]).toBe("threads");
    expect(await response.json()).toEqual({ threads: [] });
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

  test("mobile map sheet closes on Escape before the focused map can swallow it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoDeterministicChat(page);

    const trigger = page.getByTestId("map-sheet-trigger");
    await trigger.click();

    const sheet = page.getByTestId("map-sheet-content");
    await expect(sheet).toBeVisible();

    await page.evaluate(() => {
      const map = document.querySelector(
        '[data-testid="map-sheet-content"] [data-testid="chat-map"]',
      );
      if (!map) throw new Error("no map in the sheet");

      const focusTarget = document.createElement("div");
      focusTarget.tabIndex = 0;
      focusTarget.setAttribute("data-testid", "map-focus-target");
      map.appendChild(focusTarget);

      // Model Google Maps consuming keyboard events on its own container.
      map.addEventListener("keydown", (event) => event.stopPropagation());
      focusTarget.focus();
    });

    await expect(page.getByTestId("map-focus-target")).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(sheet).toBeHidden({ timeout: 10_000 });
    await expect(trigger).toBeFocused();
  });
});
