import { expect, test } from "@playwright/test";

/** Real Chromium security smoke against the running application, opt-in only. */
test.describe("SAN-1604 restaurant management guest boundary", () => {
  test.skip(process.env.MDE_SAN1604_GUEST_E2E !== "1", "Requires a running app");
  test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
  test("signed-out visitor cannot open restaurant management", async ({ page }, testInfo) => {
    await page.goto("/app/admin/restaurants", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByTestId("admin-restaurants")).toHaveCount(0);
    await expect(page.getByTestId("admin-restaurants-list")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("san1604-guest-390.png") });
  });
});
