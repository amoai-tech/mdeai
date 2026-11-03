import { test, expect } from "@playwright/test";

test.describe("SAN-1579 partner workspace guest", { tag: ["@app", "@partners"] }, () => {
  test("guest /app/partners/profile returns to login with the exact next path", async ({
    page,
  }) => {
    await page.goto("/app/partners/profile");
    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get("next")).toBe(
      "/app/partners/profile",
    );
    await expect(
      page.getByRole("button", { name: "Email magic link" }),
    ).toBeVisible();

    const selected = "11111111-1111-4111-8111-111111111111";
    await page.goto(`/app/partners/profile?partner=${selected}`);
    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get("next")).toBe(
      `/app/partners/profile?partner=${selected}`,
    );
  });
});
