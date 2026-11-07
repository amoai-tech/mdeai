import { test, expect } from "@playwright/test";

test.describe("SAN-577B /rentals map workspace", () => {
  test("desktop: map panel renders alongside card grid", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/rentals");
    await expect(page.getByTestId("rentals-browse")).toBeVisible();
    await expect(page.getByTestId("rentals-grid")).toBeVisible();
    await expect(page.getByTestId("browse-map-panel")).toBeVisible();
    // FAB is mobile-only — must not show on desktop
    await expect(page.getByTestId("browse-map-fab")).not.toBeVisible();
  });

  test("desktop: Show on map selects the matching rental", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/rentals");
    await expect(page.getByTestId("rentals-grid")).toBeVisible();
    // Listings without saved coordinates correctly have no map-selection action.
    const card = page.locator('[data-testid^="rental-card-"]')
      .filter({ has: page.locator('[data-testid^="rental-card-map-select-"]') }).first();
    await expect(card).toBeVisible();
    const pinId = await card.getAttribute("data-pin-id");
    if (!pinId) throw new Error("Map-selectable rental has no pin ID");
    const mapPanel = page.getByTestId("browse-map-panel");
    await expect(mapPanel.locator(".gm-style").first()).toBeVisible({ timeout: 20_000 });
    const map = mapPanel.getByTestId("chat-map");
    // This is the observed Google Maps camera, not the card preview state.
    await expect(map).toHaveAttribute("data-map-zoom", /\d/, { timeout: 15_000 });
    // fitBounds can already start at zoom 15 when listings are close together.
    await card.locator('[data-testid^="rental-card-map-select-"]').click();
    await expect(card).toHaveAttribute("data-selected", "true");
    await expect.poll(async () => Number(await map.getAttribute("data-map-zoom")), {
      timeout: 15_000,
    }).toBeGreaterThanOrEqual(15);
    // At city zoom, markerclusterer hides individual rental pin DOM nodes.
    // The real Google Maps info window still proves the exact pin was selected.
    await expect(mapPanel.getByTestId("selected-place-overlay"))
      .toHaveAttribute("data-pin-id", pinId, { timeout: 15_000 });
  });

  test("mobile: FAB visible and opens map sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/rentals");
    await expect(page.getByTestId("rentals-browse")).toBeVisible();
    const fab = page.getByTestId("browse-map-fab");
    await expect(fab).toBeVisible();
    await fab.click();
    await expect(page.getByRole("dialog", { name: "Map view" })).toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.getByRole("dialog", { name: "Map view" }).getByTestId("chat-map"),
    ).toBeVisible();
  });

  test("filter change updates page without losing map panel", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/rentals");
    const neighborhoodGroup = page.getByRole("group", {
      name: "Neighborhood filters",
    });
    await neighborhoodGroup.getByRole("link", { name: "Laureles" }).click();
    await page.waitForURL(/neighborhood=Laureles/, { timeout: 3000 });
    await expect(page.getByTestId("browse-map-panel")).toBeVisible();
  });

  test("no regression: rentals page loads without JS errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/rentals");
    await expect(page.getByTestId("rentals-browse")).toBeVisible();
    expect(
      errors.filter(
        // ResizeObserver loop errors are benign browser warnings from external libs.
        // Non-passive event listener warnings don't affect functionality.
        (e) =>
          !e.includes("ResizeObserver") && !e.includes("Non-passive event"),
      ),
    ).toHaveLength(0);
  });
});
