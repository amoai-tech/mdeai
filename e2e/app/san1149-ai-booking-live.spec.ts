import { test, expect } from "@playwright/test";
import { createThrowawayIdentity, deleteThrowawayIdentity, getSupabaseAdmin, signInAsOnOrigin } from "../helpers/auth";
import { sendConciergeMessage } from "../helpers/maps-layout";

test.use({ viewport: { width: 390, height: 844 }, timezoneId: "America/Bogota" });
test.skip(process.env.MDE_AI_BOOKING_LIVE !== "1", "Opt in to live-model AI booking; provider may be unavailable");
test("AI agent proposes a booking without writing first", async ({ page, baseURL }) => {
  test.setTimeout(160_000);
  const person = await createThrowawayIdentity("san1149-agent-probe");
  const admin = await getSupabaseAdmin();
  try {
    await signInAsOnOrigin(page, baseURL!, person.email);
    await page.goto(baseURL! + "/chat");
    await sendConciergeMessage(page,
      "Find Verdeo restaurant in El Poblado. Prepare a table request for two on November 15 2026 at 7 PM Medellin. " +
      "Contact name QA Test, email " + person.email + ". Show review before sending.");
    await expect(page.getByTestId("venue-booking-hitl-card")).toBeVisible({ timeout: 115_000 });
    const rows = await admin.from("venue_booking_requests").select("id", {count:"exact",head:true})
      .eq("user_id", person.userId);
    expect(rows.count).toBe(0);
    await page.getByTestId("venue-booking-hitl-reject").click();
    expect((await admin.from("venue_booking_requests").select("id", {count:"exact",head:true})
      .eq("user_id",person.userId)).count).toBe(0);
  } finally {
    await admin.from("venue_booking_requests").delete().eq("user_id",person.userId);
    await deleteThrowawayIdentity(person);
  }
});
