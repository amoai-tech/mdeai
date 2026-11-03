import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createThrowawayIdentity, deleteThrowawayIdentity, getSupabaseAdmin,
  getTestSession, hasE2eEnv, signInAsOnOrigin,
} from "../helpers/auth";
import { asUser } from "../helpers/rental-journey-fixture";

/** Actual review UI + authenticated Next.js API + live Supabase.
 * The AI tool's negative proof lives in request-venue-booking.test.ts.
 */
test.describe("SAN-1149 signed-in review -> pending booking", () => {
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: "America/Toronto" });
  test.setTimeout(150_000);
  test.skip(!hasE2eEnv() || process.env.MDE_RESTAURANT_BOOKING_LIVE !== "1",
    "Opt-in against authorized Supabase database and Next.js app required");

  test("does not write before Send; saves one ID; retry/RLS/time/refresh", async ({ page, baseURL }) => {
    const primary = await createThrowawayIdentity("san1149-review");
    const stranger = await createThrowawayIdentity("san1149-stranger");
    const admin = await getSupabaseAdmin();
    const origin = baseURL ?? "http://localhost:3041";
    const restaurantId = "a1b2c3d4-e5f6-4789-abcd-100000000005";
    const requestedAt = "2026-11-16T00:00:00.000Z";
    const args = {
      venueKind: "restaurant", restaurantId, requestedAt, partySize: 2,
      contactName: "SAN-1149 QA", contactEmail: primary.email, venueTitle: "Verdeo",
    };
    try {
      await signInAsOnOrigin(page, origin, primary.email);
      await page.addInitScript(({ proposal }) => {
        sessionStorage.setItem("mde.venue-booking.review",
          JSON.stringify({ args: proposal, savedAt: Date.now() }));
      }, { proposal: args });

      await page.goto(new URL("/chat", origin).toString());
      const review = page.getByTestId("venue-booking-hitl-card");
      await expect(review).toBeVisible({ timeout: 25000 });
      await expect(review).toContainText("7:00 PM");
      await expect(review).toContainText("Medellín");
      await expect(review.getByTestId("venue-booking-hitl-edit")).toBeVisible({ timeout: 45000 });
      await expect(review.getByTestId("venue-booking-hitl-reject")).toBeVisible();
      const evidenceDir = process.env.MDE_QA_EVIDENCE_DIR;
      if (evidenceDir) {
        await mkdir(evidenceDir, { recursive: true });
        await page.screenshot({ path: join(evidenceDir, "san1149-review-390-20261028.png"),
          mask: [page.getByText(primary.email, { exact: false })] });
      }

      const { count, error } = await admin.from("venue_booking_requests")
        .select("id", { count: "exact", head: true }).eq("user_id", primary.userId);
      expect(error).toBeNull();
      expect(count).toBe(0); // no write just from opening the AI proposal

      await review.getByTestId("venue-booking-hitl-edit").click();
      await review.getByLabel("Guests").fill("2");
      await review.getByText("Done editing").click();
      const posted = page.waitForResponse((r) => r.url().includes("/api/venue-booking/request") &&
        r.request().method() === "POST");
      await review.getByTestId("venue-booking-hitl-approve").click();
      const response = await posted;
      expect(response.status(), await response.text()).toBe(200);
      const body = await response.json() as { requestId: string };
      expect(body.requestId).toMatch(/^[a-f\d-]{36}$/i);

      await expect(page.getByTestId("venue-booking-confirmation-card"))
        .toContainText(body.requestId.slice(0, 8), { timeout: 10000 });
      if (evidenceDir) {
        await page.screenshot({ path: join(evidenceDir, "san1149-pending-receipt-390-20261028.png"),
          mask: [page.getByText(primary.email, { exact: false })] });
      }
      const persisted = await admin.from("venue_booking_requests")
        .select("id,requested_at,party_size,status,restaurant_id").eq("user_id", primary.userId);
      expect(persisted.error).toBeNull();
      expect(persisted.data).toEqual([expect.objectContaining({
        id: body.requestId, party_size: 2, status: "pending", restaurant_id: restaurantId,
      })]);
      // PostgREST serializes the same UTC instant as +00:00 rather than .000Z.
      expect(new Date(persisted.data![0].requested_at).toISOString()).toBe(requestedAt);

      await page.goto(new URL("/restaurants/" + restaurantId, origin).toString());
      await expect(page.getByTestId("restaurant-request-status")).toContainText(/pending/i);

      const other = asUser(await getTestSession(stranger.email));
      const denied = await other.from("venue_booking_requests").select("id").eq("id", body.requestId);
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual([]);

      const after = await admin.from("venue_booking_requests")
        .select("id", { count: "exact", head: true }).eq("user_id", primary.userId);
      expect(after.count).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      const deleted = await admin.from("venue_booking_requests").delete().eq("user_id", primary.userId);
      expect(deleted.error).toBeNull();
      const residue = await admin.from("venue_booking_requests")
        .select("id", { count: "exact", head: true }).eq("user_id", primary.userId);
      expect(residue.count).toBe(0);
      await deleteThrowawayIdentity(stranger);
      await deleteThrowawayIdentity(primary);
    }
  });
});
