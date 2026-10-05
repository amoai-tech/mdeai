import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  RENTAL_QUERY,
  RESTAURANT_QUERY,
  chooseRestaurantFilter,
  gotoDeterministicChat,
  mockFastPaths,
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
 * What this proves, in the deterministic test chat (real router and fast paths, mocked search
 * APIs, no CopilotKit transport):
 *   - the last visible result is above the composer, at phone and desktop widths;
 *   - nothing scrolls sideways;
 *   - the generic center-column map-results list is gone (the right-side map owns pins);
 *   - a shortcut question is shown once, and in order: question, answer, results, composer;
 *   - New Chat leaves no result or shortcut message behind.
 *
 * Event and grounded-place results use the same transcript tail but have no deterministic
 * fixtures in this suite yet, so they are not asserted here.
 */

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const composer = (page: Page) => page.getByTestId("copilot-chat-input");

async function box(locator: Locator, label: string) {
  const found = await locator.first().boundingBox();
  expect(found, `${label} must be on screen`).not.toBeNull();
  return found!;
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
      // The generic list under the chat is gone; pins live on the right-side map.
      await expect(page.getByTestId("center-chat-panel").getByTestId("results-column")).toHaveCount(0);
    });
  }

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
  // The deterministic chat above has no CopilotKit transcript, so this proves the same order in
  // the real one: the long-chat probe renders the app's own `messageView` over 500 messages.
  test("inside the real CopilotKit transcript the results tail follows the messages and precedes the composer", async ({
    page,
  }) => {
    await page.goto("/dev/chat-virtualization", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("virtualization-probe")).toHaveAttribute("data-hydrated", "true", {
      timeout: 30_000,
    });
    const tail = page.getByTestId("concierge-transcript-tail");
    await expect(tail, "the results tail must be rendered once, inside the transcript").toHaveCount(1);
    await expect(page.getByTestId("copilot-message-list")).toHaveCount(1);

    // DOM order is the contract that survives scrolling: messages, then the tail, then the box.
    const order = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="copilot-message-list"]');
      const tailEl = document.querySelector('[data-testid="concierge-transcript-tail"]');
      const input = document.querySelector('[data-testid="copilot-chat-input"]');
      const follows = (a: Element | null, b: Element | null) =>
        Boolean(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { tailAfterList: follows(list, tailEl), inputAfterTail: follows(tailEl, input) };
    });
    expect(order.tailAfterList, "the results tail must come after the message list").toBe(true);
    expect(order.inputAfterTail, "the message box must come after the results tail").toBe(true);
  });
});
