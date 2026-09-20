import { test, expect, type Page } from "@playwright/test";
import {
  ensureChatInputVisible,
  gotoMarketingHome,
  hideCopilotWebInspector,
  submitHomeHeroQuery,
  RESTAURANT_FAST_PATH_QUERY,
} from "./helpers/maps-layout";

const RESTAURANT_QUERY = RESTAURANT_FAST_PATH_QUERY;
const RENTAL_QUERY = "1BR apartment in Laureles under 80 dollars per night";

const restaurant = {
  id: "rst_test_001",
  name: "Deterministic Bistro",
  cuisine: "international",
  neighborhood: "El Poblado",
  priceTier: "$$",
  avgPricePerPerson: 24,
  currency: "USD",
  rating: 4.8,
  vibe: ["quiet"],
  imageUrl: "",
  sourceUrl: "https://mdeai.co/restaurants/rst_test_001",
  latitude: 6.2098,
  longitude: -75.5663,
};

const rental = {
  id: "rnt_test_001",
  title: "Deterministic 1BR in Laureles",
  neighborhood: "Laureles",
  nightly_price: 55,
  currency: "USD",
  bedrooms: 1,
  wifi: true,
  amenities: ["wifi", "workspace"],
  image: "",
  source_url: "https://mdeai.co/rentals/rnt_test_001",
  schedule_viewing_url:
    "https://mdeai.co/rentals/rnt_test_001/schedule-viewing",
  host_name: "QA Host",
  availability: "Available now",
  tags: ["remote-work"],
  latitude: 6.2515,
  longitude: -75.5922,
};

async function mockFastPaths(page: Page) {
  await page.route("**/api/restaurants/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [restaurant], total: 1, source: "mock" }),
    });
  });
  await page.route("**/api/rentals/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [rental], total: 1, source: "mock" }),
    });
  });
}

async function typeAndSubmit(page: Page, text: string) {
  const input = page.getByPlaceholder(/type a message/i);
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.click();
  await input.fill(text);
  await expect(input).toHaveValue(text);
  const send = page.getByTestId("copilot-send-button");
  await expect(send).toBeEnabled({ timeout: 20_000 });
  await send.click();
}

async function waitForPost(page: Page, apiPath: string) {
  return page.waitForResponse(
    (response) =>
      response.url().includes(apiPath) &&
      response.request().method() === "POST",
    { timeout: 20_000 },
  );
}

async function chooseRestaurantFilter(page: Page) {
  const chip = page.getByTestId("restaurant-filter-c-colombian");
  await expect(chip).toBeVisible({ timeout: 20_000 });
  const responsePromise = waitForPost(page, "/api/restaurants/search");
  await chip.click();
  expect((await responsePromise).ok()).toBe(true);
}

async function gotoDeterministicChat(page: Page) {
  const response = await page.goto("/chat", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);
  await hideCopilotWebInspector(page);
  const chat = page.getByTestId("concierge-chat-view-mounted");
  await expect(chat).toBeVisible({ timeout: 20_000 });
  await expect(chat).toHaveAttribute("data-hydrated", "true", {
    timeout: 30_000,
  });
  await ensureChatInputVisible(page);
}

test.describe("SAN-1341 deterministic critical journeys", () => {
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
  });
});
