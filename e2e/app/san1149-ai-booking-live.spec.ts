import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createThrowawayIdentity, deleteThrowawayIdentity, getSupabaseAdmin,
  hasE2eEnv, signInAsOnOrigin, getTestSession,
} from "../helpers/auth";
import { ensureChatInputVisible, sendConciergeMessage } from "../helpers/maps-layout";
import { asUser } from "../helpers/rental-journey-fixture";

/** Real Gemini → CopilotKit v2 → Mastra → HITL → API → live Supabase.
 * Never use this test as a release claim when it is skipped or the model is down.
 */
test.use({ viewport: { width: 390, height: 844 }, timezoneId: "America/Bogota" });
test.setTimeout(180_000);
test.skip(!hasE2eEnv() || process.env.MDE_AI_BOOKING_LIVE !== "1",
  "Opt in to live-model AI booking and authorized Supabase QA identities");

const VERDEO = "a1b2c3d4-e5f6-4789-abcd-100000000005";
// A fixed 2026 date eventually becomes a past-date false failure. Use a fresh
// Bogotá-local date so the real booking QA remains valid on future runs.
const dateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(new Date(Date.now() + 14 * 86_400_000));
const bookingDatePart = (type: "year" | "month" | "day") =>
  dateParts.find(part => part.type === type)?.value ?? "";
const BOOKING_DATE = `${bookingDatePart("year")}-${bookingDatePart("month")}-${bookingDatePart("day")}`;
const BOGOTA_7_PM = new Date(`${BOOKING_DATE}T19:00:00-05:00`).toISOString();
const askAgentToPrepare = async (page: Page, email: string, baseURL: string) => {
  // CopilotKit may connect lazily only after the first user message. Waiting
  // for a pre-message /info response made cold local runs fail without ever
  // exercising Mastra. The shared submit helper watches the actual request.
  await page.goto(new URL("/chat", baseURL).toString());
  await ensureChatInputVisible(page, 45_000);
  await sendConciergeMessage(page,
    "Find Verdeo restaurant in El Poblado. Prepare a table request for two on " +
    BOOKING_DATE + " at 7 PM Medellin. Contact name SAN-1149 QA, email " +
    email + ". Show review before sending.",
    // Live cold CopilotKit /info startup can exceed the default 6s browser reaction watch.
    35_000,
  );
  const review = page.getByTestId("venue-booking-hitl-card");
  await expect(review).toBeVisible({ timeout: 115_000 });
  await expect(review).toContainText("Verdeo", { timeout: 15_000 });
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
    const confirmation = page.getByTestId("venue-booking-confirmation-card");
    await expect(confirmation).toContainText(saved.requestId.slice(0,8),{timeout:30000});
    await expect(confirmation).toContainText("awaiting confirmation from the venue");
    await expect(confirmation).not.toContainText("WhatsApp");
    const evidenceDir = process.env.MDE_QA_EVIDENCE_DIR;
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      await page.screenshot({
        path: join(evidenceDir, "san1149-ai-saved-pending-receipt-390.png"),
        mask: [page.getByText(person.email, { exact: false })],
      });
    }
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
