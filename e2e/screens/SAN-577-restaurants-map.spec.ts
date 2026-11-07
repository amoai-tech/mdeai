import { test, expect } from "@playwright/test";

test.describe("SAN-577 /restaurants map workspace", () => {
  test("desktop: map panel renders alongside card grid", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/restaurants");
    await expect(page.getByTestId("restaurants-browse")).toBeVisible();
    await expect(page.getByTestId("restaurants-grid")).toBeVisible();
    await expect(page.getByTestId("browse-map-panel")).toBeVisible();
    // map panel must NOT be visible on the same viewport as a mobile-only element
    await expect(page.getByTestId("browse-map-fab")).not.toBeVisible();
  });

  test("desktop: View on map selects the matching restaurant", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/restaurants");
    await expect(page.getByTestId("restaurants-grid")).toBeVisible();
    // Only restaurants with real coordinates offer a map-selection action.
    const card = page.locator('[data-testid^="restaurant-card-"]')
      .filter({ has: page.getByTestId("restaurant-map-select") }).first();
    await expect(card).toBeVisible();
    const pinId = await card.getAttribute("data-pin-id");
    expect(pinId).toBeTruthy();
    const mapPanel = page.getByTestId("browse-map-panel");
    await expect(mapPanel.locator(".gm-style").first()).toBeVisible({ timeout: 20_000 });
    const marker = mapPanel.locator(`[data-testid="map-pin"][data-pin-id="${pinId}"]`);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await card.getByTestId("restaurant-map-select").click();
    await expect(card).toHaveAttribute("data-selected", "true");
    await expect(card.getByTestId("restaurant-map-select")).toHaveAttribute("aria-pressed", "true");
    await expect(marker).toHaveAttribute("data-marker-selected", "true", { timeout: 15_000 });
  });

  test("mobile: FAB visible and opens map sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/restaurants");
    await expect(page.getByTestId("restaurants-browse")).toBeVisible();
    const fab = page.getByTestId("browse-map-fab");
    await expect(fab).toBeVisible();
    await fab.click();
    await expect(
      page.getByRole("dialog", { name: "Map view" }).getByTestId("chat-map"),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("filter change updates page without losing map panel", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/restaurants");
    const neighborhoodGroup = page.getByRole("group", {
      name: "Neighborhood filters",
    });
    await neighborhoodGroup.getByRole("link", { name: "Laureles" }).click();
    await page.waitForURL(/neighborhood=Laureles/, { timeout: 3000 });
    await expect(page.getByTestId("browse-map-panel")).toBeVisible();
  });

  test("no regression: restaurants page loads without JS errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/restaurants");
    await expect(page.getByTestId("restaurants-browse")).toBeVisible();
    expect(
      errors.filter(
        (e) =>
          !e.includes("ResizeObserver") && !e.includes("Non-passive event"),
      ),
    ).toHaveLength(0);
  });
});
