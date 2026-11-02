import { expect, test } from "@playwright/test";

/**
 * Run with a deliberately unreachable localhost:9 Supabase fixture.
 * This exercises a genuine Next.js Server Component failure/retry without
 * touching real rental inventory or using a service-role credential.
 */
const fixtureUrl = "http://127.0.0.1:9";
test.skip(
  process.env.NEXT_PUBLIC_SUPABASE_URL !== fixtureUrl,
  "Requires the intentionally unreachable local Supabase fixture, never production data",
);

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("Rentals Retry issues a fresh server request when destination is unchanged", async ({ page }) => {
  await page.goto("/rentals", { waitUntil: "domcontentloaded" });
  const failure = page.getByTestId("rentals-error");
  await expect(failure).toBeVisible({ timeout: 40_000 });
  const retry = failure.getByRole("link", { name: "Retry" });
  await expect(retry).toHaveAttribute("href", "/rentals");

  // Next App Router's RSC request is the proof that search actually reran,
  // rather than Link performing a no-op same-URL navigation.
  const nextRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/rentals" && request.headers()["rsc"] === "1",
    { timeout: 30_000 },
  );
  await retry.click();
  await nextRequest;
  await expect(failure).toBeVisible(); // provider is intentionally unreachable
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
