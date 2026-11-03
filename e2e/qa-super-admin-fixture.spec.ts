import { expect, test } from "./fixtures";
import { hasE2eEnv } from "./helpers/auth";

// Super Admin fixture refuses unsafe recording settings before creating a session.
// Playwright error-context reports may still contain content: never upload these results.
test.use({ screenshot: "off", trace: "off", video: "off" });

test.describe("shared Super Admin QA fixture (read-only)", () => {
  test.skip(
    process.env.MDE_SUPER_ADMIN_QA !== "1",
    "Opt in with MDE_SUPER_ADMIN_QA=1; this uses the existing production Supabase identity",
  );

  test.beforeAll(() => {
    expect(
      hasE2eEnv(),
      "Super Admin QA needs existing Supabase URL, public key and trusted server-side admin credential",
    ).toBe(true);
  });

  test("Super Admin smoke explicitly disables sensitive recordings", async ({ screenshot, trace, video }) => {
    expect(screenshot).toBe("off");
    expect(trace).toBe("off");
    expect(video).toBe("off");
  });

  test("opens protected admin data without authenticating the ordinary page", async ({
    superAdminPage,
    page,
  }) => {
    const response = await superAdminPage.goto("/admin/rentals", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(superAdminPage.getByTestId("admin-rental-test-panel")).toBeVisible();
    await expect(superAdminPage.getByTestId("admin-rental-table")).toBeVisible();

    const api = await superAdminPage.request.get("/api/admin/rentals/test");
    expect(api.status()).toBe(200);
    const data = (await api.json()) as { rentals?: unknown[]; testAccess?: unknown[] };
    expect(Array.isArray(data.rentals)).toBe(true);
    expect(Array.isArray(data.testAccess)).toBe(true);

    // The same test can safely compare admin and anonymous sessions.
    const anonymous = await page.request.get("/api/admin/rentals/test");
    expect(anonymous.status()).toBe(401);
  });

  test("does not authenticate ordinary Playwright pages implicitly", async ({
    page,
  }) => {
    const response = await page.request.get("/api/admin/rentals/test");
    expect(response.status()).toBe(401);
  });
});
