import { randomUUID } from "node:crypto";
import { expect, test as base } from "@playwright/test";
import {
  createThrowawayIdentity, deleteThrowawayIdentity, getSupabaseAdmin,
  hasE2eEnv, signInAsOnOrigin, type ThrowawayIdentity,
} from "./helpers/auth";
import {
  assertWriteTargetAllowed, cleanupFixture, findResidue, provisionFixture,
  type Fixture, type Admin,
} from "./helpers/rental-journey-fixture";
import {
  CANDIDATE_SHA, ORIGIN, expectOneLeadOneShowing, futureLocalSlot, openCandidate, requestViewingThroughForm,
} from "./helpers/rental-journey-steps";

type ViewingsQaFixture = {
  admin: Admin;
  fixture: Fixture;
  run: string;
  renterA: ThrowawayIdentity;
  renterB: ThrowawayIdentity;
};

/**
 * SAN-1426: test-scoped fixture reuses the real SAN-1205 booking and cleanup
 * helpers. A dedicated fixture teardown still runs on assertion failure or
 * Playwright test timeout, and it has its own cleanup time budget.
 */
const test = base.extend<{ qa: ViewingsQaFixture }>({
  qa: [async ({}, applyFixture) => {
    assertWriteTargetAllowed();
    const admin = await getSupabaseAdmin();
    const run = randomUUID().slice(0, 8);
    console.log("SAN-1426 QA fixture:", run, CANDIDATE_SHA.slice(0, 12));
    let fixture: Fixture | undefined;
    let renterA: ThrowawayIdentity | undefined;
    let renterB: ThrowawayIdentity | undefined;

    try {
      // provisionFixture cleans its own partial broker/listing setup on failure.
      fixture = await provisionFixture(admin, run);
      renterA = await createThrowawayIdentity("san1426-" + run + "-a");
      renterB = await createThrowawayIdentity("san1426-" + run + "-b");
      await applyFixture({ admin, fixture, run, renterA, renterB });
    } finally {
      const failures: string[] = [];
      if (fixture) {
        try { failures.push(...await cleanupFixture(admin, fixture)); }
        catch (error) { failures.push("fixture cleanup: " + String(error)); }
        try { failures.push(...await findResidue(admin, fixture)); }
        catch (error) { failures.push("fixture residue check: " + String(error)); }
      }
      for (const person of [renterA, renterB]) {
        if (!person) continue;
        try { await deleteThrowawayIdentity(person); }
        catch (error) { failures.push("QA user cleanup: " + String(error)); }
      }
      expect(failures, "no test viewing/user records may remain").toEqual([]);
    }
  }, { auto: true, timeout: 180_000 }],
});

test.use({ trace: "off", screenshot: "off", video: "off" });
// Real DB-writing QA must never retry blindly; always tear down first.
test.describe.configure({ retries: 0 });
test.skip(
  process.env.SAN1426_VIEWINGS_E2E !== "1" || !ORIGIN || !hasE2eEnv(),
  "Opt-in requires SAN1426_VIEWINGS_E2E=1, QA environment and target URL",
);

test("signed-in renter sees own saved viewing while another renter and guest cannot", async ({ browser, qa }) => {
  test.setTimeout(360_000);
  const { admin, fixture, run, renterA, renterB } = qa;

  // The existing SAN-1205 writer uses the desktop Schedule Viewing CTA.
  // The new My Viewings screen is checked at a real 390px mobile viewport.
  const aContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let showingId: string;
  try {
    const a = await aContext.newPage();
    await signInAsOnOrigin(a, ORIGIN, renterA.email);
    await openCandidate(a);
    const requestedSlot = futureLocalSlot(3).replace(/T10:00$/, "T15:00");
    const renter = { name: "QA renter " + run, email: renterA.email, phone: "+57 3000000000" };
    const journey = { browser, admin, fixture, run };
    const committed = await requestViewingThroughForm(journey, a, renter, requestedSlot);
    showingId = committed.showingId;
    await expectOneLeadOneShowing(journey, renter, committed);
    const { data: lead, error: leadError } = await admin
      .from("leads").select("id,user_id").eq("id", committed.leadId).single();
    expect(leadError).toBeNull();
    expect(lead?.user_id, "the real writer must link the signed-in user").toBe(renterA.userId);

    await a.setViewportSize({ width: 390, height: 844 });
    await a.goto(new URL("/app/me/viewings", ORIGIN).href, { waitUntil: "domcontentloaded" });
    const own = a.getByTestId("renter-viewing-" + showingId);
    await expect(own).toBeVisible({ timeout: 40_000 });
    await expect(own.getByTestId("renter-viewing-status")).toHaveText("Requested");
    await expect(own.getByText(/3:00 PM \(Medellín time\)/)).toBeVisible();
    await expect(own.getByRole("link", { name: "View apartment details" }))
      .toHaveAttribute("href", "/rentals/" + fixture.apartmentId);
    await a.reload({ waitUntil: "domcontentloaded" });
    await expect(a.getByTestId("renter-viewing-" + showingId)).toBeVisible();
    const overflow = await a.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, "no horizontal overflow at 390px").toBe(false);
  } finally {
    await aContext.close();
  }

  const bContext = await browser.newContext();
  try {
    const b = await bContext.newPage();
    await signInAsOnOrigin(b, ORIGIN, renterB.email);
    await openCandidate(b);
    await b.goto(new URL("/app/me/viewings", ORIGIN).href, { waitUntil: "domcontentloaded" });
    await expect(b.getByTestId("renter-viewings-empty")).toBeVisible();
    await expect(b.getByTestId("renter-viewing-" + showingId)).toHaveCount(0);
  } finally {
    await bContext.close();
  }

  const guest = await browser.newPage();
  try {
    await openCandidate(guest);
    await guest.goto(new URL("/app/me/viewings", ORIGIN).href, { waitUntil: "domcontentloaded" });
    await expect(guest).toHaveURL(/\/login\?next=(%2F|\/)app(%2F|\/)me(%2F|\/)viewings/);
  } finally {
    await guest.close();
  }
});
