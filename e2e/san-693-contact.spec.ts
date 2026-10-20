import { expect, test } from "@playwright/test";

test.describe("SAN-693 · Partner contact", () => {
  test("guest sees typed contact page and saves an actual server receipt", async ({ page }) => {
    let count = 0;
    let savedRequestId = "";
    await page.route("**/api/partners/contact-leads", async route => {
      count++;
      const payload = route.request().postDataJSON() as { requestId: string };
      savedRequestId = payload.requestId;
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ success: true, leadId: savedRequestId }) });
    });
    await page.goto("/contact?type=broker");
    await expect(page.getByTestId("contact-type")).toHaveValue("broker");
    await page.getByTestId("contact-name").fill("Example Broker");
    await page.getByTestId("contact-email").fill("broker@example.invalid");
    await page.getByTestId("contact-message").fill("I would like to discuss rental listings.");
    await page.getByTestId("contact-submit").click();
    await expect(page.getByTestId("contact-success")).toBeVisible();
    await expect(page.getByTestId("contact-receipt")).toContainText(savedRequestId);
    expect(count).toBe(1);
  });

  test("network failure stays visible, retry retains the idempotency key", async ({ page }) => {
    let count = 0;
    const ids: string[] = [];
    await page.route("**/api/partners/contact-leads", async route => {
      count++;
      ids.push((route.request().postDataJSON() as { requestId: string }).requestId);
      if (count === 1) await route.fulfill({ status: 502, contentType: "application/json",
        body: JSON.stringify({ success: false, error: { message: "Temporary outage" } }) });
      else await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ success: true, leadId: ids[0] }) });
    });
    await page.goto("/contact");
    await page.getByTestId("contact-name").fill("Example Broker");
    await page.getByTestId("contact-email").fill("broker@example.invalid");
    await page.getByTestId("contact-message").fill("I would like to discuss rental listings.");
    await page.getByTestId("contact-submit").click();
    await expect(page.getByTestId("contact-error")).toContainText("Temporary outage");
    await page.getByTestId("contact-submit").click();
    await expect(page.getByTestId("contact-success")).toBeVisible();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  test("390px mobile and keyboard-accessible controls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/contact?type=vendor");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("contact-type")).toHaveValue("vendor");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect(page.getByLabel("Your name")).toBeVisible();
  });
});
