import { expect, test } from "@playwright/test";
import { hasE2eEnv, signInAsOnOrigin } from "./helpers/auth";

/**
 * SAN-1263 — production-backed, authenticated ticket wallet smoke.
 *
 * This intentionally uses the real auth cookie, real app and real database.
 * No mocked paid orders and no fabricated QR codes. The optional paid-order
 * assertion is a separate hard gate: it cannot pass until a QA-owned,
 * Stripe-paid order exists and is linked to the QA account.
 *
 * Run:
 *   PW_SKIP_WEBSERVER=1 PROD_SMOKE_BASE_URL=https://www.mdeai.co \
 *     npx playwright test e2e/prod-ticket-wallet-authed.spec.ts \
 *       --project=prod-smoke --workers=1
 *
 * For the real paid-pass acceptance proof, also set:
 *   E2E_REQUIRE_PAID_WALLET=1 E2E_WALLET_PAID_ORDER_ID=<QA-owned paid UUID>
 */
const origin = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const paidOrderId = process.env.E2E_WALLET_PAID_ORDER_ID?.trim() ?? "";
const requirePaidProof = process.env.E2E_REQUIRE_PAID_WALLET === "1";
const url = (pathname: string) => new URL(pathname, `${origin}/`).toString();

test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("SAN-1263 live authenticated ticket wallet", () => {
  test.skip(!origin, "Opt in with PROD_SMOKE_BASE_URL to avoid live-DB traffic in normal PR CI");

  test("configured environment can authenticate a real QA account", () => {
    expect(
      hasE2eEnv(),
      "Live wallet proof requires public Supabase config and a server-side QA service key",
    ).toBe(true);
  });

  test("signed-out buyers are sent to login with the wallet return path", async ({ page }) => {
    await page.goto(url("/app/me/tickets"), { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(page.url()).toContain(encodeURIComponent("/app/me/tickets"));
  });

  for (const width of [1440, 390]) {
    test(`signed-in QA can open the actual wallet at ${width}px without bypassing auth`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await signInAsOnOrigin(page, origin);

      const response = await page.goto(url("/app/me/tickets"), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Tickets", exact: true })).toBeVisible();
      await expect(
        page.getByTestId("my-tickets-empty").or(page.getByTestId("my-tickets-list")),
      ).toBeVisible();
      await expect(
        page.getByText("Your tickets are temporarily unavailable"),
      ).toHaveCount(0);
    });
  }

  test("signed-in buyer cannot open an unknown or another buyer's ticket", async ({ page }) => {
    await signInAsOnOrigin(page, origin);
    const response = await page.goto(
      url("/app/me/tickets/00000000-0000-4000-8000-000000000000"),
      { waitUntil: "domcontentloaded" },
    );
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("my-tickets-qr")).toHaveCount(0);
  });

  test("real paid QA-owned ticket renders a usable QR after reload (explicit acceptance gate)", async ({
    page,
  }) => {
    if (!paidOrderId) {
      if (requirePaidProof) {
        throw new Error(
          "E2E_REQUIRE_PAID_WALLET=1 but E2E_WALLET_PAID_ORDER_ID is missing. " +
            "A paid, QA-owned Stripe TEST order is required; do not substitute mock data.",
        );
      }
      test.skip(true, "No QA-owned paid order configured; do not count this as paid-wallet proof");
    }
    expect(paidOrderId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    await signInAsOnOrigin(page, origin);
    const detailUrl = url(`/app/me/tickets/${paidOrderId}`);
    const response = await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("my-tickets-qr")).toHaveAttribute("data-qr-state", "valid");
    await expect(page.getByTestId("my-tickets-detail")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("my-tickets-qr")).toHaveAttribute("data-qr-state", "valid");
  });
});
