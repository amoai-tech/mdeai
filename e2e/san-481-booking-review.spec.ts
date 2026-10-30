import { expect, test } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
} from "./helpers/auth";

/**
 * SAN-481 / SAN-1234 — the real rental booking review journey.
 *
 * Opt-in because it writes real rows (a pending apartment booking) to the one Supabase
 * project, which is production:
 *
 *   MDE_BOOKING_REVIEW_E2E=1 npx playwright test e2e/san-481-booking-review.spec.ts \
 *     --project=chromium --retries=0
 *
 * Every fixture and booking this test creates is deleted and read back as zero. It proves,
 * against the real database and the real Next.js app:
 *   - the review screen at 390px has no page-level horizontal overflow
 *   - one explicit submit creates exactly one booking and lands on that booking's review
 *   - an identical retry with the same idempotency key returns the same booking
 *   - the same key with different dates is rejected (409) and writes nothing
 *   - another renter cannot open the booking (404), and anonymous users must sign in
 *   - the payment button stays disabled: no charge is started by this slice
 */
const optIn = process.env.MDE_BOOKING_REVIEW_E2E === "1";
const origin = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
const START_DATE = "2026-12-01";
const OTHER_START_DATE = "2026-12-15";

test.describe("rental booking review", () => {
  test.skip(!optIn || !hasE2eEnv(), "Writes real rows: set MDE_BOOKING_REVIEW_E2E=1");

  test("one booking, retry-safe intent, 390px review and cross-renter isolation", async ({ page, browser }) => {
    const admin = await getSupabaseAdmin();
    const renter = await createThrowawayIdentity("san481-renter-a");
    let otherRenter: Awaited<ReturnType<typeof createThrowawayIdentity>> | undefined;
    const createdBookingIds: string[] = [];

    try {
      const { data: apartment, error: apartmentError } = await admin
        .from("apartments")
        .select("id,title")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(apartmentError).toBeNull();
      if (!apartment) throw new Error("No active apartment to book in this environment");

      await page.setViewportSize({ width: 390, height: 844 });

      // 0. The endpoint itself refuses anonymous callers before any session exists.
      const anonymousIntent = await page.request.post("/api/rentals/bookings", {
        data: { apartmentId: apartment.id, startDate: START_DATE, idempotencyKey: `bi-${crypto.randomUUID()}` },
      });
      expect(anonymousIntent.status()).toBe(401);

      await signInAsOnOrigin(page, origin, renter.email);

      // 1. The real UI: explicit submit creates the booking and lands on its review.
      await page.goto(`/rentals/bookings/new?apartment=${apartment.id}`);
      await expect(page.getByTestId("booking-review-new")).toBeVisible();
      await page.getByTestId("booking-start-date").fill(START_DATE);
      await page.getByTestId("booking-start-submit").click();
      await page.waitForURL(/\/rentals\/bookings\/[0-9a-f-]{36}$/, { timeout: 30_000 });
      const uiBookingId = page.url().split("/").pop()!;
      createdBookingIds.push(uiBookingId);

      // 2. The review screen is authoritative, fits the phone and cannot charge.
      await expect(page.getByTestId("booking-review")).toBeVisible();
      await expect(page.getByTestId("booking-review-status")).toContainText("Pending payment");
      await expect(page.getByTestId("booking-review-dates")).toContainText("Dec 1, 2026");
      await expect(page.getByTestId("booking-review-payment-cta")).toBeDisabled();
      const viewport = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);

      const afterSubmit = await admin.from("bookings").select("id").eq("user_id", renter.userId);
      expect(afterSubmit.error).toBeNull();
      expect(afterSubmit.data).toHaveLength(1);
      expect(afterSubmit.data?.[0]?.id).toBe(uiBookingId);

      // 3. API: an identical retry with the same key returns the SAME booking.
      const key = `bi-${crypto.randomUUID()}`;
      const payload = { apartmentId: apartment.id, startDate: START_DATE, idempotencyKey: key };
      const first = await page.request.post("/api/rentals/bookings", { data: payload });
      expect(first.status()).toBe(201);
      const firstBody = (await first.json()) as { booking: { id: string } };
      createdBookingIds.push(firstBody.booking.id);

      const retry = await page.request.post("/api/rentals/bookings", { data: payload });
      expect(retry.status()).toBe(200);
      const retryBody = (await retry.json()) as { booking: { id: string }; replayed: boolean };
      expect(retryBody.replayed).toBe(true);
      expect(retryBody.booking.id).toBe(firstBody.booking.id);

      // 3b. Five simultaneous identical requests still produce exactly one booking.
      const concurrentKey = `bi-${crypto.randomUUID()}`;
      const concurrentPayload = {
        apartmentId: apartment.id,
        startDate: START_DATE,
        idempotencyKey: concurrentKey,
      };
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          page.request.post("/api/rentals/bookings", { data: concurrentPayload }),
        ),
      );
      const bodies = (await Promise.all(responses.map((response) => response.json()))) as Array<{
        booking: { id: string };
      }>;
      expect(responses.every((response) => response.status() === 201 || response.status() === 200)).toBe(true);
      expect(new Set(bodies.map((body) => body.booking.id)).size).toBe(1);
      const concurrentRows = await admin
        .from("bookings")
        .select("id")
        .eq("user_id", renter.userId)
        .eq("idempotency_key", concurrentKey);
      expect(concurrentRows.error).toBeNull();
      expect(concurrentRows.data).toHaveLength(1);
      createdBookingIds.push(bodies[0].booking.id);

      // 4. Same key, changed dates: rejected and nothing written.
      const conflict = await page.request.post("/api/rentals/bookings", {
        data: { ...payload, startDate: OTHER_START_DATE },
      });
      expect(conflict.status()).toBe(409);
      expect(((await conflict.json()) as { error: { code: string } }).error.code).toBe(
        "IDEMPOTENCY_CONFLICT",
      );
      const afterRetries = await admin.from("bookings").select("id").eq("user_id", renter.userId);
      expect(afterRetries.data).toHaveLength(3); // UI booking + one API booking + one concurrent booking

      // 5. Another renter cannot open this booking.
      otherRenter = await createThrowawayIdentity("san481-renter-b");
      const otherPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await signInAsOnOrigin(otherPage, origin, otherRenter.email);
      const response = await otherPage.goto(`/rentals/bookings/${uiBookingId}`);
      // Next.js streams the shell before the page resolves, so a booking hidden by RLS renders
      // the 404 UI with a 200 status (same documented behaviour as /rentals/[id]). Assert the
      // outcome — no review, no booking id — rather than the status code alone.
      expect([200, 404]).toContain(response?.status());
      await expect(otherPage.getByRole("heading", { name: "404" })).toBeVisible();
      await expect(otherPage.getByTestId("booking-review")).toHaveCount(0);
      await expect(otherPage.locator("body")).not.toContainText(uiBookingId);
      await otherPage.close();

      // 6. Anonymous visitors are asked to sign in, and see no booking data.
      const anonymous = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await anonymous.goto(`/rentals/bookings/${uiBookingId}`);
      await expect(anonymous.getByTestId("booking-review-sign-in")).toBeVisible();
      await expect(anonymous.getByTestId("booking-review")).toHaveCount(0);
      await anonymous.close();
    } finally {
      // Clean up everything this run created, then prove nothing is left.
      if (createdBookingIds.length) {
        await admin.from("bookings").delete().in("id", createdBookingIds);
      }
      const userIds = [renter.userId, otherRenter?.userId].filter(Boolean) as string[];
      await admin.from("bookings").delete().in("user_id", userIds);
      const residual = await admin.from("bookings").select("id").in("user_id", userIds);
      expect(residual.data ?? []).toHaveLength(0);
      if (otherRenter) await deleteThrowawayIdentity(otherRenter);
      await deleteThrowawayIdentity(renter);
    }
  });
});
