import { test, expect, type Page } from "@playwright/test";
import {
  createThrowawayIdentity, deleteThrowawayIdentity, getSupabaseAdmin,
  hasE2eEnv, signInAsOnOrigin, getTestSession,
} from "../helpers/auth";
import { sendConciergeMessage } from "../helpers/maps-layout";
import { asUser } from "../helpers/rental-journey-fixture";

/** Real Gemini → CopilotKit v2 → Mastra → HITL → API → live Supabase.
 * Never use this test as a release claim when it is skipped or the model is down.
 */
test.use({ viewport: { width: 390, height: 844 }, timezoneId: "America/Toronto" });
test.setTimeout(180_000);
test.skip(!hasE2eEnv() || process.env.MDE_AI_BOOKING_LIVE !== "1",
  "Opt in to live-model AI booking and authorized Supabase QA identities");

const VERDEO = "a1b2c3d4-e5f6-4789-abcd-100000000005";
const BOGOTA_7_PM = "2026-11-16T00:00:00.000Z";
async function askAgentToPrepare(page: Page, email: string, baseURL: string) {
  // Arm before navigating: the initial runtime info request may finish before
  // the page load promise resolves. The 200 handshake, not a fixed sleep,
  // is the evidence that the actual CopilotKit runtime accepted the session.
  const ready = page.waitForResponse(r => r.url().includes("/api/copilotkit") &&
    r.request().postDataJSON()?.method === "info" && r.status() === 200,
    { timeout: 40_000 });
  await page.goto(new URL("/chat", baseURL).toString());
  await ready;
  await sendConciergeMessage(page,
    "Find Verdeo restaurant in El Poblado. Prepare a table request for two on " +
    "November 15 2026 at 7 PM Medellin. Contact name SAN-1149 QA, email " +
    email + ". Show review before sending.",
    // Live cold CopilotKit /info startup can exceed the default 6s browser reaction watch.
    35_000,
  );
  const review = page.getByTestId("venue-booking-hitl-card");
  await expect(review).toBeVisible({ timeout: 115_000 });
  await expect(review).toContainText("Verdeo");
  await expect(review).toContainText("7:00 PM");
  await expect(review).toContainText("Medellín");
  return review;
}

test("AI-generated Verdeo proposal: Cancel never writes", async ({ page, baseURL }) => {
  const person = await createThrowawayIdentity("san1149-ai-cancel");
  const admin = await getSupabaseAdmin();
  try {
    const origin = baseURL!;
    await signInAsOnOrigin(page, origin, person.email);
    const review = await askAgentToPrepare(page, person.email, origin);
    const before = await admin.from("venue_booking_requests").select("id",{count:"exact",head:true}).eq("user_id",person.userId);
    expect(before.error).toBeNull(); expect(before.count).toBe(0);
    await review.getByTestId("venue-booking-hitl-reject").click();
    await expect(review.getByTestId("venue-booking-hitl-reject")).toHaveCount(0,{timeout:15000});
    const after = await admin.from("venue_booking_requests").select("id",{count:"exact",head:true}).eq("user_id",person.userId);
    expect(after.error).toBeNull(); expect(after.count).toBe(0);
  } finally {
    await admin.from("venue_booking_requests").delete().eq("user_id",person.userId);
    await deleteThrowawayIdentity(person);
  }
});

test("AI-generated Verdeo proposal: Send persists exactly one pending receipt and isolates customers", async ({ page, baseURL }) => {
  const person = await createThrowawayIdentity("san1149-ai-send");
  const stranger = await createThrowawayIdentity("san1149-ai-stranger");
  const admin = await getSupabaseAdmin();
  try {
    const origin = baseURL!;
    await signInAsOnOrigin(page, origin, person.email);
    const review = await askAgentToPrepare(page, person.email, origin);
    const before = await admin.from("venue_booking_requests").select("id",{count:"exact",head:true}).eq("user_id",person.userId);
    expect(before.error).toBeNull(); expect(before.count).toBe(0);
    const posted = page.waitForResponse(r=>r.url().includes("/api/venue-booking/request") && r.request().method()==="POST");
    await review.getByTestId("venue-booking-hitl-approve").click();
    const response = await posted;
    expect(response.status(), await response.text()).toBe(200);
    const saved = await response.json() as {requestId:string};
    expect(saved.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(page.getByTestId("venue-booking-confirmation-card"))
      .toContainText(saved.requestId.slice(0,8),{timeout:30000});
    const rows=await admin.from("venue_booking_requests")
      .select("id,requested_at,party_size,status,restaurant_id")
      .eq("user_id",person.userId);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([expect.objectContaining({id:saved.requestId,status:"pending",party_size:2,restaurant_id:VERDEO})]);
    expect(new Date(rows.data![0].requested_at).toISOString()).toBe(BOGOTA_7_PM);
    await page.goto(new URL(`/restaurants/${VERDEO}`,origin).toString());
    await expect(page.getByTestId("restaurant-request-status")).toContainText(/pending/i);
    const other=asUser(await getTestSession(stranger.email));
    const forbidden=await other.from("venue_booking_requests").select("id").eq("id",saved.requestId);
    expect(forbidden.error).toBeNull();expect(forbidden.data).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await admin.from("venue_booking_requests").delete().eq("user_id",person.userId);
    await admin.from("venue_booking_requests").delete().eq("user_id",stranger.userId);
    await deleteThrowawayIdentity(stranger);
    await deleteThrowawayIdentity(person);
  }
});
