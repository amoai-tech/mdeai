import { expect, test } from "@playwright/test";
import { signInAsOnOrigin, hasE2eEnv } from "../helpers/auth";

const origin = process.env.SMOKE_BASE_URL || "http://localhost:3131";
test.describe("SAN-1531 named restaurant chat — actual signed-in agent", () => {
  test.skip(process.env.MDE_SAN1531_LIVE_E2E !== "1" || !hasE2eEnv(), "Explicit opt-in QA-only signed-in agent test");
  test.setTimeout(120_000);
  test.use({ viewport: { width: 390, height: 844 } });

  test("Mal De Ojo returns correct sourced location without unrelated-venue denial", async ({ page }, testInfo) => {
    const replies: Array<{ path: string; status: number }> = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/")) {
        replies.push({ path: new URL(r.url()).pathname, status: r.status() });
      }
    });
    await signInAsOnOrigin(page, origin);
    await page.goto(origin + "/chat", { waitUntil: "domcontentloaded" });
    const composer = page.locator("textarea").first();
    await expect(composer).toBeEnabled({ timeout: 30000 });
    await composer.fill("Where is Mal De Ojo restaurant in Medellín? Give its street address and cite a source. Do not book anything.");
    await composer.press("Enter");
    await expect(page.getByText(/Calle 8 #43C-68/i).first()).toBeVisible({ timeout: 85000 });
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0, { timeout: 65000 });
    const completedText = await page.locator("body").innerText();
    expect(completedText).toContain("Mal De Ojo");
    expect(completedText).toContain("Calle 8 #43C-68");
    expect(completedText).not.toMatch(/could not (locate|find) Mal De Ojo/i);
    const detailUrl = "/restaurants/b049abc8-2ffd-4f14-ae5c-635d94936385";
    await expect(page.locator(`a[href*="${detailUrl}"]`).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Open map with 1 pins" })).toBeVisible();
    await page.screenshot({path: testInfo.outputPath("san1531-chat-mal-de-ojo-390.png"), fullPage: true});
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({path: testInfo.outputPath("san1531-chat-mal-de-ojo-1440.png"), fullPage: false});
    console.log("SAN1531_COMPLETED_CHAT_EXCERPT", completedText.slice(-850));
    console.log("SAN1531_CHAT_REQUEST_STATUSES", JSON.stringify(replies.slice(-12)));
    expect(replies.some((r) => r.status >= 500)).toBe(false);
  });
});
