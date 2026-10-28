import { test, expect } from "@playwright/test";
import {
  attachConsoleWatcher,
  assertConsoleHygiene,
  gotoBrowseRoute,
} from "../helpers/venue-release";

test.describe("SCREEN-027 /events browse", () => {
  test("loads catalog with event grid or empty state", async ({ page }) => {
    const errors = attachConsoleWatcher(page);
    await gotoBrowseRoute(page, "/events");
    await expect(page.getByTestId("events-browse").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Events in Medellín" }),
    ).toBeVisible();

    const cards = page.getByTestId("event-card");
    const empty = page.getByTestId("events-empty");
    const cardCount = await cards.count();
    if (cardCount > 0) {
      await expect(cards.first()).toBeVisible();
      await expect(page.getByTestId("events-grid")).toBeVisible();
    } else {
      await expect(empty).toBeVisible();
    }

    assertConsoleHygiene(errors);
  });

  test("filters render for date, category, neighborhood, and price", async ({
    page,
  }) => {
    const errors = attachConsoleWatcher(page);
    await gotoBrowseRoute(page, "/events");
    await expect(
      page.getByRole("group", { name: "Date filters" }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Category filters" }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Neighborhood filters" }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Price filters" }),
    ).toBeVisible();
    assertConsoleHygiene(errors);
  });

  test("music category filter updates URL", async ({ page }) => {
    const errors = attachConsoleWatcher(page);
    await gotoBrowseRoute(page, "/events");
    const categoryFilters = page.getByRole("group", {
      name: "Category filters",
    });
    await categoryFilters.getByRole("link", { name: "Music" }).click();
    await expect(page).toHaveURL(/category=music/, { timeout: 15_000 });
    await expect(
      categoryFilters.getByRole("link", { name: "Music" }),
    ).toHaveAttribute("aria-current", "true");
    assertConsoleHygiene(errors);
  });

  test("phone: secondary filters collapse behind More filters, results stay in one column", async ({
    page,
  }) => {
    const errors = attachConsoleWatcher(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoBrowseRoute(page, "/events");
    const more = page.getByTestId("events-filter-more");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("group", { name: "Price filters" })).toBeHidden();
    // Retry the click until React has hydrated the button; only click while still collapsed.
    await expect(async () => {
      if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
    }).toPass();
    await expect(page.getByRole("group", { name: "Price filters" })).toBeVisible();
    await page.getByTestId("events-filter-price-paid").click();
    await expect(page).toHaveURL(/price=paid/, { timeout: 15_000 });
    // An applied secondary filter stays visible after navigation.
    await expect(page.getByRole("group", { name: "Price filters" })).toBeVisible();
    await expect(page.getByTestId("events-filter-price-paid")).toHaveAttribute("aria-current", "true");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    assertConsoleHygiene(errors);
  });

  test("desktop: results fill the pane in two columns when there are two or more events", async ({
    page,
  }) => {
    const errors = attachConsoleWatcher(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoBrowseRoute(page, "/events");
    const cards = page.getByTestId("event-card");
    await expect(page.getByTestId("events-browse").first()).toBeVisible();
    if ((await cards.count()) < 2) test.skip(true, "Needs two published events");
    await expect(cards.nth(1)).toBeVisible();
    const [a, b] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(4);
    expect(b!.x).toBeGreaterThan(a!.x);
    assertConsoleHygiene(errors);
  });

  test("Details link navigates to event detail when cards exist", async ({
    page,
  }) => {
    const errors = attachConsoleWatcher(page);
    await gotoBrowseRoute(page, "/events");
    const details = page.getByTestId("event-details-cta").first();
    if ((await details.count()) === 0) {
      test.skip(true, "No published events in catalog");
    }
    await details.click();
    await expect(page).toHaveURL(/\/events\/[^/]+$/, { timeout: 15_000 });
    assertConsoleHygiene(errors);
  });

  test("sidebar Events nav links to browse catalog", async ({ page }) => {
    const errors = attachConsoleWatcher(page);
    await gotoBrowseRoute(page, "/");
    const eventsLink = page.getByTestId("nav-events-link");
    await expect(eventsLink).not.toHaveAttribute("aria-disabled", "true");
    await eventsLink.click();
    await expect(page).toHaveURL(/\/events/, { timeout: 15_000 });
    await expect(page.getByTestId("events-browse").first()).toBeVisible();
    assertConsoleHygiene(errors);
  });

  test("duplicate category query params do not crash", async ({ page }) => {
    const errors = attachConsoleWatcher(page);
    await gotoBrowseRoute(page, "/events?category=music&category=food");
    await expect(page.getByTestId("events-browse").first()).toBeVisible();
    assertConsoleHygiene(errors);
  });
});
