import { expect, type Page } from "@playwright/test";

/** Select a listing-local wall-clock via the real shared shadcn Calendar + native time field. */
export async function chooseViewingDateTime(page: Page, localWallClock: string): Promise<void> {
  const [iso, time] = localWallClock.split("T");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Expected a Medellín-local YYYY-MM-DDTHH:mm value");
  }
  const [year, month, day] = iso.split("-").map(Number);
  const modal = page.getByTestId("schedule-viewing-modal");
  await modal.getByTestId("viewing-date-trigger").click();
  await expect(modal.getByTestId("viewing-date-calendar")).toBeVisible();
  const dayButton = modal.locator(`button[data-day="${month}/${day}/${year}"]`).first();
  for (let i = 0; i < 36 && (await dayButton.count()) === 0; i++) {
    await modal.getByRole("button", { name: /next month/i }).click();
  }
  await expect(dayButton, `Viewing date ${iso} must be on the calendar`).toBeVisible();
  await dayButton.click();
  await modal.getByTestId("viewing-time").fill(time);
  await expect(modal.getByTestId("viewing-date-selection")).toContainText(iso);
}

export async function advanceViewingReview(page: Page): Promise<void> {
  const modal = page.getByTestId("schedule-viewing-modal");
  await modal.getByTestId("schedule-viewing-review-button").click();
  await expect(modal.getByTestId("schedule-viewing-review")).toBeVisible();
}
