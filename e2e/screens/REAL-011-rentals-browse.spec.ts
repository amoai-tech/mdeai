import { test, expect } from "@playwright/test";

test.describe("REAL-011 /rentals browse", () => {
  test("loads rentals page and shows exactly one truthful state", async ({ page }) => {
    await page.goto("/rentals");
    await expect(page.getByTestId("rentals-browse")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rentals" })).toBeVisible();
    // SAN-1089: the page never fabricates demo cards. Depending on real inventory and database
    // health it shows real cards, an honest empty state, or an "unavailable + Retry" state —
    // and only one of them.
    const states = [
      page.getByTestId("rentals-grid"),
      page.getByTestId("rentals-empty"),
      page.getByTestId("rentals-error"),
    ];
    await expect
      .poll(async () => {
        let visible = 0;
        for (const state of states) visible += (await state.count()) > 0 ? 1 : 0;
        return visible;
      })
      .toBe(1);
  });

  test("neighborhood filter chip sets URL param and shows active state", async ({
    page,
  }) => {
    await page.goto("/rentals");
    const neighborhoodGroup = page.getByRole("group", {
      name: "Neighborhood filters",
    });
    await neighborhoodGroup.getByRole("link", { name: "Laureles" }).click();
    await expect(page).toHaveURL(/neighborhood=Laureles/, { timeout: 15_000 });
    await expect(
      neighborhoodGroup.getByRole("link", { name: "Laureles" }),
    ).toHaveAttribute("aria-current", "true");
  });

  test("bedroom filter chip sets URL param", async ({ page }) => {
    await page.goto("/rentals");
    const bedsGroup = page.getByRole("group", { name: "Bedroom filters" });
    await bedsGroup.getByRole("link", { name: "2 BR" }).click();
    await expect(page).toHaveURL(/beds=2/, { timeout: 15_000 });
    await expect(
      bedsGroup.getByRole("link", { name: "2 BR" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("renders no nightly price chips and ignores a stale ?maxPrice= bookmark", async ({
    page,
  }) => {
    await page.goto("/rentals?maxPrice=100");
    await expect(page.getByTestId("rentals-browse")).toBeVisible();
    await expect(page.getByRole("group", { name: "Price filters" })).toHaveCount(0);
    // Only the retired price FILTERS are asserted gone. Card prices are SAN-1229's surface.
    await expect(page.getByText("Max price / night")).toHaveCount(0);
    await expect(page.locator('[data-testid^="rentals-filter-price"]')).toHaveCount(0);
    // Filter links must not carry the retired param forward.
    const hrefs = await page
      .getByRole("group", { name: "Neighborhood filters" })
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.some((href) => href.includes("maxPrice"))).toBe(false);
  });

  test("direct URL with filters pre-selects chips", async ({ page }) => {
    await page.goto("/rentals?neighborhood=El+Poblado&beds=1");
    await expect(
      page
        .getByRole("group", { name: "Neighborhood filters" })
        .getByRole("link", { name: "El Poblado" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page
        .getByRole("group", { name: "Bedroom filters" })
        .getByRole("link", { name: "1 BR" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("/rentals no longer redirects to /chat", async ({ page }) => {
    await page.goto("/rentals");
    await expect(page).not.toHaveURL(/\/chat/);
    await expect(page).toHaveURL(/\/rentals/);
  });
});
