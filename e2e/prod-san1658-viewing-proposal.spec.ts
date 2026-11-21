import { expect, test } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "./helpers/auth";

/**
 * SAN-1658 — opt-in real AI → editable proposal → native modal on a 390px phone.
 * Requires a real public MDE preview at an exact commit, and real disposable QA auth.
 * No final viewing submission: existing SAN-1204 proves the atomic broker transaction.
 *
 * MDE_SAN1658_VIEWING_E2E=1 PW_SKIP_WEBSERVER=1 \
 *   PROD_SMOKE_BASE_URL=https://<MDE-preview>.vercel.app \
 *   MDE_QA_EXPECTED_PREVIEW_SHA=<exact-40-char-head> \
 *   npx playwright test e2e/prod-san1658-viewing-proposal.spec.ts \
 *     --project=prod-smoke --retries=0 --workers=1
 */
const origin = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const expectedSha = process.env.MDE_QA_EXPECTED_PREVIEW_SHA?.trim() ?? "";
const enabled = process.env.MDE_SAN1658_VIEWING_E2E === "1";
const dateInBogota = (daysAhead: number) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() + daysAhead * 86_400_000));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

test.use({
  channel: "chrome", viewport: { width: 390, height: 844 },
  trace: "off", screenshot: "off", video: "off",
});

test.describe("SAN-1658 — editable AI viewing proposal on 390px", () => {
  test.skip(
    !enabled || !origin || !/^[a-f0-9]{40}$/i.test(expectedSha),
    "Requires explicit SAN1658 opt-in, deployed MDE preview URL and exact commit",
  );
  let renter: ThrowawayIdentity | undefined;
  test.beforeAll(async () => {
    expect(hasE2eEnv(), "Real disposable Supabase QA credentials required").toBe(true);
    renter = await createThrowawayIdentity("qa-san1658-proposal");
  });
  test.afterAll(async () => {
    if (renter) await deleteThrowawayIdentity(renter);
  });

  test("one grounded viewing opens the seeded modal and Cancel writes nothing", async ({ page }) => {
    test.setTimeout(180_000);
    const url = new URL(origin);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toMatch(/^mdeai-[a-z0-9-]+-amo-agency\.vercel\.app$/i);
    const response = await page.request.get(new URL("/api/version", url).toString(), {
      failOnStatusCode: false, maxRedirects: 0,
    });
    expect(response.status(), "Preview must be publicly reachable at its real app version").toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(await response.json()).toMatchObject({ sha: expectedSha, environment: "preview" });

    const submissions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/leads/schedule-viewing")) {
        submissions.push(request.url());
      }
    });

    await signInAsOnOrigin(page, origin, renter!.email);
    await page.goto(new URL("/rentals?neighborhood=Laureles", origin).toString(), {
      waitUntil: "domcontentloaded",
    });
    const composer = page.locator('[data-testid="rental-ask-composer"]:visible').first();
    const input = composer.locator("#rental-ask-input");
    const send = composer.getByTestId("rental-ask-send");
    await expect(page.locator('[data-testid^="rental-details-cta-"]').first())
      .toBeVisible({ timeout: 50_000 });

    await input.fill("Show furnished 2-bedroom apartments in Laureles");
    await expect(send).toBeEnabled({ timeout: 45_000 });
    await input.press("Enter");
    await expect(input).toHaveValue("", { timeout: 15_000 });
    await expect(composer.getByTestId("rental-ask-stop")).toHaveCount(0, { timeout: 90_000 });

    await input.fill("Schedule a viewing for the first apartment");
    await expect(send).toBeEnabled({ timeout: 30_000 });
    await input.press("Enter");
    const proposal = page.getByTestId("a2ui-viewing-proposal").last();
    await expect(proposal).toBeVisible({ timeout: 75_000 });
    const requestedDate = dateInBogota(45);
    await proposal.getByTestId("viewing-proposal-date").fill(requestedDate);
    await proposal.getByTestId("viewing-proposal-time").fill("16:00");
    // A real pointer click must clear mobile sticky header + composer. No force-click.
    await proposal.getByTestId("viewing-proposal-continue").click({ timeout: 20_000 });

    const modal = page.getByTestId("schedule-viewing-modal");
    await expect(modal).toBeVisible({ timeout: 25_000 });
    await expect(modal.getByTestId("viewing-date-selection")).toContainText(requestedDate);
    await expect(modal.getByTestId("viewing-time")).toHaveValue("16:00");
    expect(submissions).toHaveLength(0);
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toHaveCount(0);
    expect(submissions).toHaveLength(0);
  });
});
