import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  EVENT_QUERY,
  GROUNDED_QUERY,
  RENTAL_QUERY,
  RESTAURANT_QUERY,
  chooseRestaurantFilter,
  event,
  gotoDeterministicChat,
  groundedPlace,
  mockFastPaths,
  rental,
  typeAndSubmit,
  waitForPost,
} from "./helpers/deterministic-chat";

/**
 * SAN-966 · Keep chat results together and always place the message box below the latest answer.
 *
 * The defect: results (rental and restaurant cards, shortcut messages, citations) were rendered
 * as siblings of the chat, so the message box sat ABOVE them. A renter who asked for "1BR in
 * Laureles" saw the composer in the middle of the screen with the answer underneath it.
 *
 * In the deterministic test chat (real router and fast paths, mocked search APIs, no CopilotKit
 * transport) this proves:
 *   - rental, event, grounded-place, and restaurant results stay above the composer;
 *   - rental results stay above the composer at phone, laptop, and desktop widths;
 *   - nothing scrolls sideways;
 *   - a shortcut question and its clarifying answer appear once, in order (question, answer,
 *     composer), and the results that replace the clarify stay above the composer;
 *   - New Chat leaves no result or shortcut message behind.
 *
 * Through the dev probe pages, in the REAL CopilotKit chat view, it proves:
 *   - an exchange that arrives while the thread is empty is still shown (CopilotKit would show
 *     only its welcome screen);
 *   - with a seeded exchange the tail sits inside the transcript's scroll content, after the
 *     message list, and ends above the composer.
 * Transcript/local de-duplication is unit-tested (concierge-transcript-contract.test.tsx), not
 * here: the probe has no live agent, so no exchange is published into a thread.
 */

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const composer = (page: Page) => page.getByTestId("copilot-chat-input");

async function box(locator: Locator, label: string) {
  const found = await locator.first().boundingBox();
  if (!found) throw new Error(`${label} must be on screen`);
  return found;
}

/** `upper` ends at or above where `lower` begins, so it reads first. */
async function expectReadsBefore(upper: Locator, upperLabel: string, lower: Locator, lowerLabel: string) {
  const a = await box(upper, upperLabel);
  const b = await box(lower, lowerLabel);
  expect(
    a.y + a.height,
    `${upperLabel} (ends at ${Math.round(a.y + a.height)}px) must be above ${lowerLabel} (starts at ${Math.round(b.y)}px)`,
  ).toBeLessThanOrEqual(b.y + 1);
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth, "the page must not scroll horizontally").toBeLessThanOrEqual(
    overflow.clientWidth,
  );
}

async function askForRentals(page: Page) {
  await gotoDeterministicChat(page);
  const response = waitForPost(page, "/api/rentals/search");
  await typeAndSubmit(page, RENTAL_QUERY);
  expect((await response).ok()).toBe(true);
  await expect(page.getByTestId("rental-card")).toHaveCount(1);
}

test.describe("SAN-966 results stay above the message box", { tag: ["@critical", "@deterministic"] }, () => {
  test.beforeEach(async ({ page }) => {
    await mockFastPaths(page);
  });

  for (const viewport of VIEWPORTS) {
    test(`rental results are above the composer at ${viewport.width}px (${viewport.name})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await askForRentals(page);

      await expectReadsBefore(
        page.getByTestId("rental-fast-path-panel"),
        "the rental results",
        composer(page),
        "the message box",
      );
      await expectNoSidewaysScroll(page);
    });
  }

  test("event results are above the composer", async ({ page }) => {
    await gotoDeterministicChat(page);
    const response = waitForPost(page, "/api/events/search");
    await typeAndSubmit(page, EVENT_QUERY);
    expect((await response).ok()).toBe(true);
    await expect(page.getByTestId("event-card")).toHaveCount(1);
    await expectReadsBefore(
      page.getByTestId("event-fast-path-panel"),
      "the event results",
      composer(page),
      "the message box",
    );
  });

  test("grounded-place results are above the composer", async ({ page }) => {
    await gotoDeterministicChat(page);
    const response = waitForPost(page, "/api/grounded/search");
    await typeAndSubmit(page, GROUNDED_QUERY);
    expect((await response).ok()).toBe(true);
    await expect(page.getByTestId("grounded-card")).toHaveCount(1);
    await expectReadsBefore(
      page.getByTestId("grounded-fast-path-panel"),
      "the grounded-place results",
      composer(page),
      "the message box",
    );
  });

  test("a later search of another kind replaces the earlier results (grounded → event → rental)", async ({ page }) => {
    await gotoDeterministicChat(page);
    await typeAndSubmit(page, GROUNDED_QUERY);
    await expect(page.getByTestId("grounded-card")).toHaveCount(1);

    await typeAndSubmit(page, EVENT_QUERY);
    await expect(page.getByTestId("event-card")).toHaveCount(1);
    await expect(page.getByTestId("grounded-fast-path-panel"), "grounded results are stale").toHaveCount(0);

    await typeAndSubmit(page, RENTAL_QUERY);
    await expect(page.getByTestId("rental-card")).toHaveCount(1);
    await expect(page.getByTestId("event-fast-path-panel"), "event results are stale").toHaveCount(0);
    await expectReadsBefore(
      page.getByTestId("rental-fast-path-panel"),
      "the rental results",
      composer(page),
      "the message box",
    );
  });

  // The rental matrix above already covers the phone; the other three result types get it too.
  test.describe("on a 390px phone", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
    });

    test("event results are above the composer and fit the screen", async ({ page }) => {
      await gotoDeterministicChat(page);
      const response = waitForPost(page, "/api/events/search");
      await typeAndSubmit(page, EVENT_QUERY);
      expect((await response).ok()).toBe(true);
      await expect(page.getByTestId("event-card")).toHaveCount(1);
      await expectReadsBefore(
        page.getByTestId("event-fast-path-panel"),
        "the event results",
        composer(page),
        "the message box",
      );
      await expectNoSidewaysScroll(page);
    });

    test("grounded-place results are above the composer and fit the screen", async ({ page }) => {
      await gotoDeterministicChat(page);
      const response = waitForPost(page, "/api/grounded/search");
      await typeAndSubmit(page, GROUNDED_QUERY);
      expect((await response).ok()).toBe(true);
      await expect(page.getByTestId("grounded-card")).toHaveCount(1);
      await expectReadsBefore(
        page.getByTestId("grounded-fast-path-panel"),
        "the grounded-place results",
        composer(page),
        "the message box",
      );
      await expectNoSidewaysScroll(page);
    });

    test("restaurant results are above the composer and fit the screen", async ({ page }) => {
      await gotoDeterministicChat(page);
      await typeAndSubmit(page, RESTAURANT_QUERY);
      await expect(page.getByTestId("restaurant-clarify")).toBeVisible();
      await chooseRestaurantFilter(page);
      await expect(page.getByTestId("restaurant-card")).toHaveCount(1);
      await expectReadsBefore(
        page.getByTestId("restaurant-fast-path-panel"),
        "the restaurant results",
        composer(page),
        "the message box",
      );
      await expectNoSidewaysScroll(page);
    });
  });

  test("a shortcut question is shown once, in order, with everything above the composer", async ({ page }) => {
    await gotoDeterministicChat(page);
    await typeAndSubmit(page, RESTAURANT_QUERY);

    // The shortcut answers with a clarifying question: question, answer, then the message box.
    const question = page.getByText(RESTAURANT_QUERY, { exact: true });
    const clarify = page.getByTestId("restaurant-clarify");
    await expect(clarify).toBeVisible();
    await expect(question, "the question must appear exactly once").toHaveCount(1);
    await expectReadsBefore(question, "the question", clarify, "the clarifying answer");
    await expectReadsBefore(clarify, "the clarifying answer", composer(page), "the message box");

    // After the renter answers it, the results replace it, still above the message box.
    await chooseRestaurantFilter(page);
    await expect(page.getByTestId("restaurant-card")).toHaveCount(1);
    await expectReadsBefore(
      page.getByTestId("restaurant-fast-path-panel"),
      "the restaurant results",
      composer(page),
      "the message box",
    );
  });

  test("New Chat leaves no results or shortcut messages behind", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoDeterministicChat(page);
    await typeAndSubmit(page, RESTAURANT_QUERY);
    await chooseRestaurantFilter(page);
    await expect(page.getByTestId("restaurant-card")).toHaveCount(1);
    await expect(page.getByTestId("concierge-local-messages")).toHaveCount(1);

    await page.getByTestId("nav-new-chat").click();

    await expect(page.getByTestId("restaurant-card")).toHaveCount(0);
    await expect(page.getByTestId("restaurant-fast-path-panel")).toHaveCount(0);
    await expect(page.getByTestId("rental-fast-path-panel")).toHaveCount(0);
    await expect(page.getByTestId("concierge-local-messages")).toHaveCount(0);
    await expect(page.getByText(RESTAURANT_QUERY, { exact: true })).toHaveCount(0);
  });
  // The deterministic chat above has no CopilotKit transcript. The two tests below run the REAL
  // CopilotKit chat view (through the dev probe pages) with a seeded shortcut exchange.

  test("with an empty thread the shortcut exchange is still shown (CopilotKit would show only its welcome screen)", async ({
    page,
  }) => {
    await page.goto("/dev/chat-empty-thread", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("empty-thread-probe")).toHaveAttribute("data-hydrated", "true", {
      timeout: 30_000,
    });
    // Nothing to show yet: the welcome screen owns the view, so the results tail is not mounted.
    await expect(page.getByTestId("concierge-transcript-tail")).toHaveCount(0);

    // A fast-path exchange arrives while the thread is still empty, as when the AI runtime is down.
    await page.getByTestId("probe-seed").click();
    await expect(page.getByTestId("concierge-transcript-tail")).toHaveCount(1);
    await expect(page.getByText("Probe shortcut question", { exact: true }), "shown once").toHaveCount(1);
    await expect(page.getByText("Probe shortcut answer", { exact: true }), "shown once").toHaveCount(1);
  });

  test("in the real transcript the tail follows the messages and ends above the message box", async ({ page }) => {
    await page.goto("/dev/chat-virtualization", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("virtualization-probe")).toHaveAttribute("data-hydrated", "true", {
      timeout: 30_000,
    });
    await page.getByTestId("probe-seed").click();

    const tail = page.getByTestId("concierge-transcript-tail");
    await expect(tail).toHaveCount(1);
    await expect(tail.getByText("Probe shortcut answer", { exact: true })).toHaveCount(1);

    // Scroll the real scroller to the bottom, where the newest content lives.
    await page.evaluate(() => {
      let node: HTMLElement | null = document.querySelector('[data-testid="copilot-scroll-content"]');
      while (node && !(node.scrollHeight > node.clientHeight && /(auto|scroll)/.test(getComputedStyle(node).overflowY))) {
        node = node.parentElement;
      }
      if (node) node.scrollTop = node.scrollHeight;
    });

    const structure = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="copilot-message-list"]');
      const tailEl = document.querySelector('[data-testid="concierge-transcript-tail"]');
      const content = document.querySelector('[data-testid="copilot-scroll-content"]');
      return {
        // Contained nodes also report "following", so containment must be ruled out explicitly.
        tailAfterList: Boolean(list && tailEl && list.compareDocumentPosition(tailEl) & Node.DOCUMENT_POSITION_FOLLOWING),
        tailInsideList: Boolean(list && tailEl && list.contains(tailEl)),
        tailInsideScrollContent: Boolean(content && tailEl && content.contains(tailEl)),
      };
    });
    expect(structure.tailAfterList, "the tail must come after the message list").toBe(true);
    expect(structure.tailInsideList, "the tail must not be nested inside the message list").toBe(false);
    expect(structure.tailInsideScrollContent, "the tail must live in the transcript's scroll content").toBe(true);

    // Order is not enough: the renter must be able to SEE it, clear of the message box.
    await expectReadsBefore(tail, "the results tail", composer(page), "the message box");
    await expect(tail).toBeInViewport();
  });
});

/**
 * SAN-1422 · Make map results truthful and clear stale pins when results have no coordinates.
 * A search can return cards that cannot be pinned. The chat must say so, and the map must not keep
 * the previous search's pins.
 */
test.describe("SAN-1422 map pins match the results", { tag: ["@critical", "@deterministic"] }, () => {
  /** The same fixture with its coordinates removed: a usable card that cannot be pinned. */
  const withoutCoordinates = <T extends { latitude: number; longitude: number }>(row: T) => {
    const copy: Partial<T> = { ...row };
    delete copy.latitude;
    delete copy.longitude;
    return copy;
  };
  const unmappedEvent = withoutCoordinates(event);

  test.beforeEach(async ({ page }) => {
    await mockFastPaths(page);
  });

  test("a search with no mappable results removes the earlier search's pins and does not promise any", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await askForRentals(page);
    await expect(page.getByTestId("map-pin")).toHaveCount(1);

    // Routes registered later win, so this replaces the mocked events response for this test only.
    await page.route("**/api/events/search", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [unmappedEvent], total: 1, source: "mock" }),
      });
    });
    const response = waitForPost(page, "/api/events/search");
    await typeAndSubmit(page, EVENT_QUERY);
    expect((await response).ok()).toBe(true);

    await expect(page.getByTestId("event-card")).toHaveCount(1);
    await expect(page.getByTestId("rental-card")).toHaveCount(0);
    await expect(page.getByTestId("map-pin")).toHaveCount(0);
    await expect(page.getByText("Map locations aren't available for these yet.")).toBeVisible();
    await expect(page.getByText(/pins on the map/)).toHaveCount(0);
  });

  test("a café search with no coordinates replaces the rental cards but leaves the rental pin on the map", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await askForRentals(page);
    await expect(page.getByTestId("map-pin")).toHaveCount(1);

    await page.route("**/api/grounded/search", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [withoutCoordinates(groundedPlace)],
          attribution: [],
          source: "mock",
          metadata: { venueKind: "cafe" },
        }),
      });
    });
    const response = waitForPost(page, "/api/grounded/search");
    await typeAndSubmit(page, GROUNDED_QUERY);
    expect((await response).ok()).toBe(true);

    await expect(page.getByTestId("grounded-card")).toHaveCount(1);
    await expect(page.getByTestId("rental-card")).toHaveCount(0);
    await expect(page.getByTestId("map-pin")).toHaveCount(1);
  });

  test("when only some results have coordinates the chat says how many are on the map", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route("**/api/rentals/search", async (route) => {
      const unmapped = withoutCoordinates(rental);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [rental, { ...unmapped, id: "rnt_test_002", title: "Second 1BR, no location yet" }],
          total: 2,
          source: "mock",
        }),
      });
    });
    await gotoDeterministicChat(page);
    const response = waitForPost(page, "/api/rentals/search");
    await typeAndSubmit(page, RENTAL_QUERY);
    expect((await response).ok()).toBe(true);

    await expect(page.getByTestId("rental-card")).toHaveCount(2);
    await expect(page.getByTestId("map-pin")).toHaveCount(1);
    await expect(page.getByText(/2 rentals · 1 shown on the map/)).toBeVisible();
    await expect(page.getByText(/pins on the map/)).toHaveCount(0);
  });

  test("on a 390px phone an event without coordinates is still a card above the composer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/events/search", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [unmappedEvent], total: 1, source: "mock" }),
      });
    });
    await gotoDeterministicChat(page);
    const response = waitForPost(page, "/api/events/search");
    await typeAndSubmit(page, EVENT_QUERY);
    expect((await response).ok()).toBe(true);

    await expect(page.getByTestId("event-card")).toHaveCount(1);
    await expect(page.getByText("Map locations aren't available for these yet.")).toBeVisible();
    await expectReadsBefore(
      page.getByTestId("event-fast-path-panel"),
      "the event results",
      composer(page),
      "the message box",
    );
    await expectNoSidewaysScroll(page);
  });
});
