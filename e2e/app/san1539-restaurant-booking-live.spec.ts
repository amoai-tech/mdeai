import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  signInAsOnOrigin,
} from "../helpers/auth";
import { asUser } from "../helpers/rental-journey-fixture";

/**
 * SAN-1539: opt-in true production-Supabase transaction through the REAL Next.js
 * API on the local application build. No fake response, second booking engine,
 * business certification gate, or service-role credential in the browser.
 * Credentials must be provided from the authorized .env/.env.local.
 */
test.describe("SAN-1539 real restaurant UUID-only reservation request", () => {
  test.setTimeout(140_000);
  test.skip(
    !hasE2eEnv() || process.env.MDE_RESTAURANT_BOOKING_LIVE !== "1",
    "Opt in with MDE_RESTAURANT_BOOKING_LIVE=1 and real Supabase E2E credentials",
  );

  test("restaurant without Google ID → persisted pending receipt → retry same ID → other user denied", async ({
    page, baseURL,
  }) => {
    const primary = await createThrowawayIdentity("san1539-booking");
    const stranger = await createThrowawayIdentity("san1539-unrelated");
    const admin = await getSupabaseAdmin();
    // Source-backed Verdeo record: its incorrect Google ID has been cleared in the
    // canonical migration. This exercises UUID-only, not a manufactured Place ID.
    const restaurantId = "a1b2c3d4-e5f6-4789-abcd-100000000005";
    let savedId: string | undefined;
    const origin = baseURL ?? "http://localhost:3001";
    try {
      const { data: restaurant, error: restaurantError } = await admin.from("restaurants")
        .select("id, google_place_id").eq("id", restaurantId).single();
      expect(restaurantError).toBeNull();
      expect(restaurant?.google_place_id).toBeNull();

      await signInAsOnOrigin(page, origin, primary.email);
      const input = {
        venueKind: "restaurant",
        restaurantId,
        requestedAt: "2026-11-15T23:00:00.000Z",
        partySize: 2,
        contactName: "SAN-1539 QA renter",
        contactEmail: primary.email,
      };
      const send = () => page.request.post(new URL("/api/venue-booking/request", origin).toString(), {
        data: input,
      });
      const first = await send();
      expect(first.status(), await first.text()).toBe(200);
      const firstBody = await first.json() as { success: boolean; requestId: string; message: string };
      expect(firstBody.success).toBe(true);
      expect(firstBody.requestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(firstBody.message).toContain("not a confirmed reservation");
      savedId = firstBody.requestId;

      const { data: rows, error } = await admin.from("venue_booking_requests")
        .select("id,user_id,restaurant_id,place_id,status,party_size")
        .eq("user_id", primary.userId);
      expect(error).toBeNull();
      expect(rows).toEqual([expect.objectContaining({
        id: savedId, user_id: primary.userId, restaurant_id: restaurantId,
        place_id: null, status: "pending", party_size: 2,
      })]);

      const retry = await send();
      expect(retry.status(), await retry.text()).toBe(200);
      const retryBody = await retry.json() as { requestId: string };
      expect(retryBody.requestId).toBe(savedId);
      const { count, error: countError } = await admin.from("venue_booking_requests")
        .select("id", { head: true, count: "exact" }).eq("user_id", primary.userId);
      expect(countError).toBeNull();
      expect(count).toBe(1);

      const different = await page.request.post(
        new URL("/api/venue-booking/request", origin).toString(),
        { data: { ...input, placeId: "ChIJnotTheSame9999" } },
      );
      expect(different.status()).toBe(400);

      const other = asUser(await getTestSession(stranger.email));
      const denied = await other.from("venue_booking_requests")
        .select("id").eq("id", savedId);
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual([]);

      await page.setViewportSize({ width: 390, height: 844 });
      // Device-width runtime smoke only; a screenshot of the signed-in session
      // must remain private. The booking request itself is proved by DB readback.
      expect(await page.evaluate(() => innerWidth)).toBe(390);
    } finally {
      const failures: string[] = [];
      const del = await admin.from("venue_booking_requests")
        .delete().eq("user_id", primary.userId);
      if (del.error) failures.push(del.error.message);
      const residue = await admin.from("venue_booking_requests")
        .select("id", { count: "exact", head: true }).eq("user_id", primary.userId);
      if (residue.error) failures.push(residue.error.message);
      if (residue.count !== 0) failures.push(`booking residue ${residue.count}`);
      for (const identity of [stranger, primary]) {
        try { await deleteThrowawayIdentity(identity); }
        catch (error) { failures.push(String(error)); }
      }
      expect(failures).toEqual([]);
    }
  });
});
