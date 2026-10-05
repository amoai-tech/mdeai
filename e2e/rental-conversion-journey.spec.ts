import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getSupabaseAdmin, hasE2eEnv } from "./helpers/auth";
import {
  assertWriteTargetAllowed,
  cleanupFixture,
  findResidue,
  provisionFixture,
  renterEmail,
} from "./helpers/rental-journey-fixture";
import {
  CANDIDATE_SHA,
  OPT_IN,
  ORIGIN,
  expectOneLeadOneShowing,
  expectOtherBrokerDenied,
  expectOwnerReceivesRequest,
  expectOwnerSeesRequestOnPhone,
  expectRefusedRequestsWriteNothing,
  expectReplayCreatesNothing,
  expectUnsavedRequestIsHonest,
  futureLocalSlot,
  openCandidate,
  requestViewingThroughForm,
  type JourneyCtx,
} from "./helpers/rental-journey-steps";

/**
 * SAN-1205 · Prove a Renter Can Schedule a Viewing and the Correct Broker Receives It.
 *
 * One reusable journey, written so any release candidate can re-run it:
 *
 *   renter opens a real published listing → requests a viewing through the shipped UI →
 *   exactly one lead and one showing exist → the owning broker sees that request →
 *   an unrelated broker cannot (database, API and screen) → bad requests create nothing →
 *   replaying the same request creates nothing new → every row this run made is gone.
 *
 * What the test seeds: two throwaway brokers and one published listing owned by the first.
 * That is setup, not the behaviour under test. Everything under test — the form, the API, the
 * lead and showing writes, and what each broker can read — goes through the shipped product.
 * The service-role client only seeds, reads postconditions and cleans up.
 *
 * Opt-in, because it creates real rows in the shared Supabase project:
 *
 *   SAN1205_JOURNEY_E2E=1 SAN1205_ALLOW_PRODUCTION_WRITES=1 \
 *   PROD_SMOKE_BASE_URL=<release-candidate-or-production-url> \
 *     npx playwright test e2e/rental-conversion-journey.spec.ts --project=prod-smoke --retries=0
 *
 * SAN1205_ALLOW_PRODUCTION_WRITES=1 is required whenever the configured Supabase project is not
 * local, whatever web address is under test. The run prints its fixture run id first, so rows
 * stranded by a killed run can be found.
 *
 * A failed click is a failed test. The page's buttons are server-rendered HTML that only
 * respond after React attaches its handlers, so the test waits for that to be true and then
 * clicks exactly once. It never repeats a click until something happens to appear.
 */

test.describe.configure({ mode: "serial" });

test.describe("SAN-1205 · a renter's viewing request reaches the correct broker", () => {
  test.skip(
    !OPT_IN || !ORIGIN || !hasE2eEnv(),
    "Opt-in only: needs SAN1205_JOURNEY_E2E=1, PROD_SMOKE_BASE_URL and live Supabase env.",
  );

  test("request, ownership, isolation, failure, replay and cleanup", async ({ browser }) => {
    test.setTimeout(600_000);
    assertWriteTargetAllowed();

    const admin = await getSupabaseAdmin();
    const run = randomUUID().slice(0, 8);
    // Printed before anything is created, so rows stranded by a killed run can be found.
    console.log(`SAN-1205 fixture run: ${run}  (rows: SAN1205 * ${run}, san1205-*-${run}-* emails)`);
    const fixture = await provisionFixture(admin, run);
    const ctx: JourneyCtx = { browser, admin, fixture, run };

    // The journey failure is captured, not thrown from `finally`: a cleanup error thrown there
    // would replace it and hide why the product actually failed.
    let journeyFailure: unknown;
    try {
      const renter = { name: `Sofia ${run}`, email: renterEmail(run, "renter"), phone: "+57 3000000000" };
      const slot = futureLocalSlot(3);

      const renterCtx = await browser.newContext();
      const renterPage = await renterCtx.newPage();
      await openCandidate(renterPage);

      const committed = await requestViewingThroughForm(ctx, renterPage, renter, slot);
      await expectOneLeadOneShowing(ctx, renter, committed);
      await expectReplayCreatesNothing(ctx, renterPage, renter, slot, committed);
      await expectRefusedRequestsWriteNothing(ctx, renterPage, renter, slot);
      await expectUnsavedRequestIsHonest(ctx, renterPage, renter, slot);
      await renterCtx.close();

      await expectOwnerReceivesRequest(ctx, committed);
      await expectOwnerSeesRequestOnPhone(ctx, committed);
      await expectOtherBrokerDenied(ctx, committed);
    } catch (err) {
      journeyFailure = err;
    }

    const cleanupFailures = await cleanupFixture(admin, fixture);
    const residue = await findResidue(admin, fixture);

    if (journeyFailure) {
      // Report residue loudly, then rethrow the real cause: a failing run that also stranded
      // rows must not look like a plain assertion failure.
      if (cleanupFailures.length > 0) {
        console.error(`[san-1205] cleanup incomplete after a failing journey: ${cleanupFailures.join("; ")}`);
      }
      if (residue.length > 0) {
        console.error(`[san-1205] RESIDUE after a failing journey: ${residue.join("; ")}`);
      }
      throw journeyFailure;
    }

    expect(cleanupFailures, "cleanup must not fail").toEqual([]);
    expect(residue, "every row this run created must be gone").toEqual([]);

    console.log(`SAN-1205 journey PASSED  origin=${ORIGIN}  sha=${CANDIDATE_SHA || "(not recorded)"}`);
  });
});
