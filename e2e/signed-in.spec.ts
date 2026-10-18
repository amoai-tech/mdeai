import { test, expect } from "./fixtures";
import { hasE2eEnv } from "./helpers/auth";

// SAN-1549: opt-in real Supabase login, never a global auth bypass.
// Shared read-only QA identity; state-mutating tests need isolated actors.
// Authenticated traces/screenshots can contain private data and session cookies.
test.use({ trace: "off", screenshot: "off", video: "off" });
test.beforeAll(() => {
  expect(
    hasE2eEnv(),
    "QA sign-in needs NEXT_PUBLIC_SUPABASE_URL, a Supabase public key, and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY). Set them in ignored .env.local or CI secrets; never commit them.",
  ).toBe(true);
});

test("real signed-in QA user can open Saved without a login redirect", async ({
  authenticatedPage,
}) => {
  const response = await authenticatedPage.goto("/saved", {
    waitUntil: "domcontentloaded",
  });

  expect(response?.status()).toBe(200);
  await expect(authenticatedPage).toHaveURL(/\/saved(?:[?#]|$)/);
  await expect(authenticatedPage.getByTestId("saved-page")).toBeVisible();
  await expect(
    authenticatedPage.getByRole("heading", { name: "Saved collections" }),
  ).toBeVisible();
  await expect(authenticatedPage.getByTestId("saved-empty-signin")).toHaveCount(0);
  await expect(authenticatedPage.getByTestId("saved-empty-collections").or(
    authenticatedPage.getByTestId("saved-collections-grid"),
  )).toBeVisible();
});
