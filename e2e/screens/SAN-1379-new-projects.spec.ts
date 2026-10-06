import { test, expect } from "@playwright/test";

/**
 * SAN-1379 — public New Projects browse + profile journey. It runs without AI and without
 * login, proving the catalog works on its own before the concierge or lead tasks exist.
 */
test.describe("SAN-1379 /new-projects browse", () => {
  test("loads the published projects grid without AI or login", async ({ page }) => {
    await page.goto("/new-projects");
    await expect(page.getByTestId("new-projects-browse")).toBeVisible();
    await expect(page.getByRole("heading", { name: "New projects in Medellín" })).toBeVisible();
    await expect(page.getByTestId("new-projects-grid")).toBeVisible();
    await expect(page.locator('[data-testid^="new-project-card-"]').first()).toBeVisible();
  });

  test("neighborhood filter sets the URL param and active state", async ({ page }) => {
    await page.goto("/new-projects");
    const group = page.getByRole("group", { name: "Neighborhood filters" });
    await group.getByRole("link", { name: "Laureles" }).click();
    await expect(page).toHaveURL(/neighborhood=Laureles/, { timeout: 15_000 });
    await expect(group.getByRole("link", { name: "Laureles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("delivery filter sets the URL param", async ({ page }) => {
    await page.goto("/new-projects");
    const group = page.getByRole("group", { name: "Delivery filters" });
    await group.getByRole("link", { name: "Delivery 2027" }).click();
    await expect(page).toHaveURL(/delivery=2027/, { timeout: 15_000 });
  });

  test("a direct URL with filters pre-selects the chips", async ({ page }) => {
    await page.goto("/new-projects?neighborhood=Laureles&beds=2");
    await expect(
      page
        .getByRole("group", { name: "Neighborhood filters" })
        .getByRole("link", { name: "Laureles" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("group", { name: "Bedroom filters" }).getByRole("link", { name: "2+ BR" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("opening a card shows the profile with provenance", async ({ page }) => {
    await page.goto("/new-projects");
    await page.locator('[data-testid^="new-project-card-link-"]').first().click();
    await expect(page.getByTestId("new-project-detail")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("new-project-detail-price")).toBeVisible();
    await expect(page.getByTestId("new-project-evidence")).toBeVisible();
    await expect(page.getByTestId("new-project-back")).toBeVisible();
  });

  test("a partial project states its unknowns instead of guessing", async ({ page }) => {
    await page.goto("/new-projects/grand-coral");
    await expect(page.getByTestId("new-project-detail")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("new-project-detail-price")).toContainText("Not published");
    await expect(page.getByTestId("new-project-units-empty")).toBeVisible();
  });
});

test.describe("SAN-1379 mobile profile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("browse and profile render on a phone-sized viewport", async ({ page }) => {
    await page.goto("/new-projects");
    await expect(page.getByTestId("new-projects-grid")).toBeVisible();
    await page.goto("/new-projects/arrayan");
    await expect(page.getByTestId("new-project-detail")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("new-project-cta-row")).toBeVisible();
    await expect(page.getByTestId("new-project-cta-schedule")).toBeVisible();
  });
});
