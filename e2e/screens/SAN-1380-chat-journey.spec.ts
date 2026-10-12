import { test, expect } from "@playwright/test";
import {
  NEW_PROJECT_QUERY,
  gotoDeterministicChat,
  mockFastPaths,
  mockNewProjectFastPath,
  typeAndSubmit,
} from "../helpers/deterministic-chat";

/**
 * SAN-1380 — the browser chat journey. Sofia types a new-project request in /chat; the
 * deterministic New Projects fast path calls the read-only search and the real chat renders
 * grounded cards, with unknown facts explicit. Desktop and 390px mobile.
 */
test.describe("SAN-1380 browser chat journey", () => {
  test("typing a new-project request renders grounded cards", async ({ page }) => {
    test.setTimeout(120_000);
    await mockFastPaths(page);
    await mockNewProjectFastPath(page);
    await gotoDeterministicChat(page);
    await typeAndSubmit(page, NEW_PROJECT_QUERY);

    const card = page.getByTestId("new-project-tool-card-arrayan");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("From COP 575,000,000");
    await expect(card).toContainText("Delivery date not published");
    await expect(card).toContainText("Not published: delivery date.");
    await expect(card.locator('[data-testid="new-project-tool-source"]')).toBeVisible();
  });

  test("a non-new-project query does not render project cards", async ({ page }) => {
    test.setTimeout(120_000);
    await mockFastPaths(page);
    await mockNewProjectFastPath(page);
    await gotoDeterministicChat(page);
    await typeAndSubmit(page, "what can I do tonight");
    await expect(page.getByTestId("new-project-fast-path-panel")).toHaveCount(0);
  });
});

test.describe("SAN-1380 mobile chat journey", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("renders grounded cards on a phone-sized viewport", async ({ page }) => {
    test.setTimeout(120_000);
    await mockFastPaths(page);
    await mockNewProjectFastPath(page);
    await gotoDeterministicChat(page);
    await typeAndSubmit(page, NEW_PROJECT_QUERY);
    await expect(page.getByTestId("new-project-tool-card-arrayan")).toBeVisible({ timeout: 20_000 });
  });
});
