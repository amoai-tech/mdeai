import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createThrowawayIdentity, deleteThrowawayIdentity, getSupabaseAdmin,
  hasE2eEnv, signInAsOnOrigin, type ThrowawayIdentity,
} from "./helpers/auth";
import {
  assertWriteTargetAllowed, cleanupFixture, findResidue, provisionFixture,
} from "./helpers/rental-journey-fixture";
import {
  CANDIDATE_SHA, ORIGIN, futureLocalSlot, openCandidate, requestViewingThroughForm,
} from "./helpers/rental-journey-steps";

/** SAN-1426: reuse the actual Schedule Viewing writer and SAN-1205 cleanup. */
test.use({ trace: "off", screenshot: "off", video: "off" });
test.skip(
  process.env.SAN1426_VIEWINGS_E2E !== "1" || !ORIGIN || !hasE2eEnv(),
  "Opt-in requires SAN1426_VIEWINGS_E2E=1, QA environment and target URL",
);
test("signed-in renter sees own saved viewing while another renter and guest cannot", async ({ browser }) => {
  test.setTimeout(360_000);
  assertWriteTargetAllowed();
  const admin = await getSupabaseAdmin();
  const run = randomUUID().slice(0, 8);
  console.log("SAN-1426 QA fixture:", run, CANDIDATE_SHA.slice(0, 12));
  const fixture = await provisionFixture(admin, run);
  let renterA: ThrowawayIdentity | undefined;
  let renterB: ThrowawayIdentity | undefined;
  let thrown: unknown;
  try {
    renterA = await createThrowawayIdentity("san1426-" + run + "-a");
    renterB = await createThrowawayIdentity("san1426-" + run + "-b");
    const aContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await aContext.newPage();
    await signInAsOnOrigin(a, ORIGIN, renterA.email);
    await openCandidate(a);
    const committed = await requestViewingThroughForm(
      { browser, admin, fixture, run }, a,
      { name: "QA renter " + run, email: renterA.email, phone: "+57 3000000000" },
      futureLocalSlot(3),
    );
    const { data: lead, error: leadError } = await admin
      .from("leads").select("id,user_id").eq("id", committed.leadId).single();
    expect(leadError).toBeNull();
    expect(lead?.user_id, "the real writer must link the signed-in user").toBe(renterA.userId);

    await a.goto(new URL("/app/me/viewings", ORIGIN).href, { waitUntil: "domcontentloaded" });
    const own = a.getByTestId("renter-viewing-" + committed.showingId);
    await expect(own).toBeVisible({ timeout: 40_000 });
    await expect(own.getByTestId("renter-viewing-status")).toHaveText("Requested");
    await expect(own.getByRole("link", { name: "View apartment details" }))
      .toHaveAttribute("href", "/rentals/" + fixture.apartmentId);
    await a.reload({ waitUntil: "domcontentloaded" });
    await expect(a.getByTestId("renter-viewing-" + committed.showingId)).toBeVisible();
    await aContext.close();

    const bContext = await browser.newContext();
    const b = await bContext.newPage();
    await signInAsOnOrigin(b, ORIGIN, renterB.email);
    await openCandidate(b);
    await b.goto(new URL("/app/me/viewings", ORIGIN).href, { waitUntil: "domcontentloaded" });
    await expect(b.getByTestId("renter-viewings-empty")).toBeVisible();
    await expect(b.getByTestId("renter-viewing-" + committed.showingId)).toHaveCount(0);
    await bContext.close();

    const guest = await browser.newPage();
    await openCandidate(guest);
    await guest.goto(new URL("/app/me/viewings", ORIGIN).href, { waitUntil: "domcontentloaded" });
    await expect(guest).toHaveURL(/\/login\?next=(%2F|\/)app(%2F|\/)me(%2F|\/)viewings/);
    await guest.close();
  } catch (error) { thrown = error; }
  const failures = await cleanupFixture(admin, fixture);
  const residue = await findResidue(admin, fixture);
  if (renterA) await deleteThrowawayIdentity(renterA);
  if (renterB) await deleteThrowawayIdentity(renterB);
  expect(failures, "fixture cleanup failures").toEqual([]);
  expect(residue, "no QA lead/showing residues").toEqual([]);
  if (thrown) throw thrown;
});
