import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
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
 *   - a full refresh + resubmit resumes that booking instead of creating a second one
 *   - an identical retry with the same key returns the same booking; five simultaneous
 *     identical requests still produce exactly one row
 *   - the same key with different dates is rejected (409) and writes nothing
 *   - another renter cannot open the booking, and anonymous users must sign in
 *   - the payment button stays disabled: no charge is started by this slice
 */
const optIn = process.env.MDE_BOOKING_REVIEW_E2E === "1";
const origin = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";

/** Move-in dates are always in the future, so this test never rots into a 400. */
const isoDateFromNow = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const START_DATE = isoDateFromNow(30);
const OTHER_START_DATE = isoDateFromNow(44);
const START_LABEL = new Date(`${START_DATE}T12:00:00Z`).toLocaleDateString("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

type IntentPayload = { apartmentId: string; startDate: string; idempotencyKey: string };
type IntentBody = { booking?: { id: string }; replayed?: boolean; error?: { code?: string } };

const postIntent = async (request: APIRequestContext, data: IntentPayload) => {
  const response = await request.post("/api/rentals/bookings", { data });
  const body = (await response.json().catch(() => ({}))) as IntentBody;
  return { status: response.status(), body };
};

/** The renter's real UI path: listing → review link → move-in date → submit. */
async function submitReviewFromListing(page: Page, apartmentId: string, startDate: string): Promise<string> {
  await page.goto(`/rentals/${apartmentId}`);
  const link = page.getByTestId("rental-detail-booking-review-link");
  await expect(link).toBeVisible();
  // A cold dev server compiles the target route on first request; a <Link> click before
  // hydration is swallowed. Settle the document first, then wait for the URL change.
  await page.waitForLoadState("networkidle");
  await Promise.all([page.waitForURL(/\/rentals\/bookings\/new/), link.click()]);
  await expect(page.getByTestId("booking-review-new")).toBeVisible();
  await page.getByTestId("booking-start-date").fill(startDate);
  await page.getByTestId("booking-start-submit").click();
  await page.waitForURL(/\/rentals\/bookings\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  return page.url().split("/").pop()!;
}

const bookingIdsFor = async (admin: SupabaseClient, userId: string) => {
  const { data, error } = await admin.from("bookings").select("id").eq("user_id", userId);
  expect(error).toBeNull();
  return (data ?? []).map((row) => row.id as string);
};

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

      // 0. The endpoint refuses anonymous callers before any session exists.
      const anonymous = await postIntent(page.request, {
        apartmentId: apartment.id,
        startDate: START_DATE,
        idempotencyKey: `bi-${crypto.randomUUID()}`,
      });
      expect(anonymous.status).toBe(401);

      await signInAsOnOrigin(page, origin, renter.email);

      // 1. The real UI creates exactly one booking and lands on its review.
      const uiBookingId = await submitReviewFromListing(page, apartment.id, START_DATE);
      createdBookingIds.push(uiBookingId);
      expect(await bookingIdsFor(admin, renter.userId)).toEqual([uiBookingId]);

      // 2. The review is authoritative, fits the phone and cannot charge.
      await expect(page.getByTestId("booking-review")).toBeVisible();
      await expect(page.getByTestId("booking-review-status")).toContainText("Pending payment");
      await expect(page.getByTestId("booking-review-dates")).toContainText(START_LABEL);
      await expect(page.getByTestId("booking-review-payment-cta")).toBeDisabled();
      const viewport = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);

      // 2b. A full refresh + resubmit resumes the same booking (the stored key survives).
      await page.goto(`/rentals/bookings/new?apartment=${apartment.id}`);
      await page.getByTestId("booking-start-date").fill(START_DATE);
      await page.getByTestId("booking-start-submit").click();
      await page.waitForURL(/\/rentals\/bookings\/[0-9a-f-]{36}$/, { timeout: 30_000 });
      expect(page.url().split("/").pop()).toBe(uiBookingId);
      expect(await bookingIdsFor(admin, renter.userId)).toEqual([uiBookingId]);

      // 3. An identical API retry returns the same booking.
      const payload: IntentPayload = {
        apartmentId: apartment.id,
        startDate: START_DATE,
        idempotencyKey: `bi-${crypto.randomUUID()}`,
      };
      const first = await postIntent(page.request, payload);
      expect(first.status).toBe(201);
      createdBookingIds.push(first.body.booking!.id);
      const retry = await postIntent(page.request, payload);
      expect(retry.status).toBe(200);
      expect(retry.body.replayed).toBe(true);
      expect(retry.body.booking?.id).toBe(first.body.booking?.id);

      // 3b. Five simultaneous identical requests still produce exactly one row.
      const concurrentPayload = { ...payload, idempotencyKey: `bi-${crypto.randomUUID()}` };
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => postIntent(page.request, concurrentPayload)),
      );
      expect(responses.every(({ status }) => status === 201 || status === 200)).toBe(true);
      const concurrentIds = new Set(responses.map(({ body }) => body.booking!.id));
      expect(concurrentIds.size).toBe(1);
      createdBookingIds.push([...concurrentIds][0]);
      const { data: concurrentRows } = await admin
        .from("bookings")
        .select("id")
        .eq("user_id", renter.userId)
        .eq("idempotency_key", concurrentPayload.idempotencyKey);
      expect(concurrentRows).toHaveLength(1);

      // 4. Same key, changed dates: rejected and nothing written.
      const conflict = await postIntent(page.request, { ...payload, startDate: OTHER_START_DATE });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error?.code).toBe("IDEMPOTENCY_CONFLICT");
      expect(await bookingIdsFor(admin, renter.userId)).toHaveLength(3);

      // 5. Another renter cannot open this booking. Next.js streams the shell before the page
      // resolves, so a booking hidden by RLS renders the 404 UI with a 200 (as /rentals/[id]).
      otherRenter = await createThrowawayIdentity("san481-renter-b");
      const otherPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await signInAsOnOrigin(otherPage, origin, otherRenter.email);
      const response = await otherPage.goto(`/rentals/bookings/${uiBookingId}`);
      expect([200, 404]).toContain(response?.status());
      await expect(otherPage.getByRole("heading", { name: "404" })).toBeVisible();
      await expect(otherPage.getByTestId("booking-review")).toHaveCount(0);
      await expect(otherPage.locator("body")).not.toContainText(uiBookingId);
      await otherPage.close();

      // 6. Anonymous visitors are asked to sign in and see no booking data.
      const anonymousPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await anonymousPage.goto(`/rentals/bookings/${uiBookingId}`);
      await expect(anonymousPage.getByTestId("booking-review-sign-in")).toBeVisible();
      await expect(anonymousPage.getByTestId("booking-review")).toHaveCount(0);
      await anonymousPage.close();
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
