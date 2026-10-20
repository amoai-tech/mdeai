import { expect, type ConsoleMessage, type Page, type Request } from "@playwright/test";
import {
  ensureChatInputVisible,
  hideCopilotWebInspector,
  RESTAURANT_FAST_PATH_QUERY,
} from "./maps-layout";

/**
 * Fixtures and steps shared by the SAN-1341 and SAN-966 deterministic specs: mocked rental, event,
 * grounded-place and restaurant fast-path APIs, and the real chat input driven the way a renter
 * drives it. One copy, so the specs cannot drift apart.
 */

export const RESTAURANT_QUERY = RESTAURANT_FAST_PATH_QUERY;
export const RENTAL_QUERY = "1BR apartment in Laureles under 80 dollars per night";
export const EVENT_QUERY = "salsa events this weekend";
export const GROUNDED_QUERY = "best cafes medellin";

export const restaurant = {
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

export const rental = {
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
  // SAN-1349: the deterministic fast-path fixture models a fully owned, approved, published
  // listing, so the browse card is expected to expose the Schedule viewing CTA.
  can_schedule_viewing: true,
  schedule_viewing_url:
    "https://mdeai.co/rentals/rnt_test_001/schedule-viewing",
  host_name: "QA Host",
  availability: "Available now",
  tags: ["remote-work"],
  latitude: 6.2515,
  longitude: -75.5922,
};

export const event = {
  id: "evt_test_001",
  title: "Deterministic Salsa Night",
  category: "music",
  venue: "Deterministic Social Club",
  neighborhood: "El Poblado",
  // Static date: the mock returns it whatever the query says ("this weekend" is not evaluated).
  startsAt: "2026-10-10T01:00:00.000Z",
  pricePerTicket: 15,
  currency: "USD",
  imageUrl: "",
  sourceUrl: "https://mdeai.co/events/evt_test_001",
  latitude: 6.2088,
  longitude: -75.5671,
};

export const groundedPlace = {
  id: "gnd_test_001",
  title: "Deterministic Coffee Lab",
  mapsUrl: "https://maps.google.com/?cid=1001",
  directionsUrl: "https://www.google.com/maps/dir/?api=1&destination_place_id=ChIJDeterministic",
  reviewsUrl: "https://search.google.com/local/reviews?placeid=ChIJDeterministic",
  latitude: 6.2442,
  longitude: -75.5812,
  placeId: "ChIJDeterministic",
  rating: 4.7,
  userRatingCount: 321,
  priceLevel: "PRICE_LEVEL_MODERATE",
  openNow: true,
  formattedAddress: "Laureles, Medellín",
  primaryType: "coffee_shop",
  summary: "Quiet specialty coffee with workspace seating.",
  fieldMaskVersion: "places-v1",
};

/**
 * Google's own source for `groundedPlace`, as the grounding tool returns it. Its name differs from the
 * card title on purpose: the card must show Google's name (SAN-878).
 */
export const groundedSource = {
  source: "google_maps_grounding",
  placeUri: groundedPlace.mapsUrl,
  title: "Deterministic Coffee Lab & Roastery",
};

export async function mockFastPaths(page: Page, options: { mockThreads?: boolean } = {}) {
  // Most deterministic chat pages mount the nav rail and GET /api/threads.
  // Never let those cases call the real Supabase-backed endpoint in CI.
  // Tests owning a custom saved-thread fixture must explicitly opt out so a
  // last-registered route cannot mask their thread list (Playwright LIFO order).
  if (options.mockThreads !== false) {
    await page.route("**/api/threads", (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "x-mde-e2e-fixture": "threads" },
        body: JSON.stringify({ threads: [] }),
      });
    });
  }
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
  await page.route("**/api/events/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [event], total: 1, source: "mock" }),
    });
  });
  await page.route("**/api/grounded/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [groundedPlace],
        attribution: [groundedSource],
        source: "mock",
        metadata: { venueKind: "cafe" },
      }),
    });
  });
}

export async function typeAndSubmit(page: Page, text: string) {
  const input = page.getByPlaceholder(/type a message/i);
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.click();
  await input.fill(text);
  await expect(input).toHaveValue(text);
  const send = page.getByTestId("copilot-send-button");
  await expect(send).toBeEnabled({ timeout: 20_000 });
  await send.click();
}

export async function waitForPost(page: Page, apiPath: string) {
  return page.waitForResponse(
    (response) =>
      response.url().includes(apiPath) &&
      response.request().method() === "POST",
    { timeout: 20_000 },
  );
}

export async function chooseRestaurantFilter(page: Page) {
  const chip = page.getByTestId("restaurant-filter-c-colombian");
  await expect(chip).toBeVisible({ timeout: 20_000 });
  const responsePromise = waitForPost(page, "/api/restaurants/search");
  await chip.click();
  expect((await responsePromise).ok()).toBe(true);
}

export async function gotoDeterministicChat(page: Page) {
  // Only emit diagnostics when the navigation/hydration assertion fails; keep
  // passing runs quiet and preserve the original error as the cause.
  const failures: string[] = [];
  const record = (label: string, detail: string) => {
    if (failures.length < 15) failures.push(`${label}: ${detail.slice(0, 220)}`);
  };
  const onPageError = (error: Error) => record("pageerror", error.message);
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error") record("console", message.text());
  };
  const onRequestFailed = (request: Request) => {
    const path = new URL(request.url()).pathname;
    record("requestfailed", `${request.method()} ${path} ${request.failure()?.errorText ?? ""}`);
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);
  try {
    const response = await page.goto("/chat", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);
    await hideCopilotWebInspector(page);
    const chat = page.getByTestId("concierge-chat-view-mounted");
    await expect(chat).toBeVisible({ timeout: 20_000 });
    // Next.js dev can cold-compile client chunks on a shared GitHub runner.
    // Wait on actual hydration (never a fixed sleep); a failure still reports
    // the DOM state and browser/network errors below.
    await expect(chat).toHaveAttribute("data-hydrated", "true", {
      timeout: 45_000,
    });
    await ensureChatInputVisible(page);
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      readyState: document.readyState,
      chatHydrated: document.querySelector('[data-testid="concierge-chat-view-mounted"]')
        ?.getAttribute("data-hydrated") ?? "missing",
      chatCount: document.querySelectorAll('[data-testid="concierge-chat-view-mounted"]').length,
    })).catch(() => ({ readyState: "unavailable", chatHydrated: "unavailable", chatCount: -1 }));
    throw new Error(
      `Deterministic chat did not initialize: ${JSON.stringify(snapshot)}; ` +
      `browser errors: ${JSON.stringify(failures)}`,
      { cause: error },
    );
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("requestfailed", onRequestFailed);
  }
}
