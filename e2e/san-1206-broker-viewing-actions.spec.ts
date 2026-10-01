/**
 * SAN-1206 · a broker actually confirms and reschedules a real viewing request.
 *
 * WHAT THIS PROVES THAT THE OTHER TESTS CANNOT
 *
 * The pgTAP file proves the database contract and the Vitest route test proves the HTTP
 * contract, but neither can show that a person clicking a button on `/host/rentals` produces
 * the right row. This journey drives the real UI through the real route into the real RPC and
 * then reads the persisted row back.
 *
 * TARGET
 *
 * Local Supabase + the local dev server. The issue explicitly asks for a non-production
 * target, and the repo's `.env` points at production, so this spec refuses to run against
 * anything that is not a loopback host. That guard is the reason it is safe to leave enabled.
 *
 * ONE PROVISION, ONE CLEANUP
 *
 * Two unconfirmed requests are created once — one to confirm (and replay), one to reschedule —
 * and torn down in a single cleanup that is verified rather than assumed.
 *
 * Opt in with: SAN1206_BROKER_E2E=1 npx playwright test --project=chromium \
 *   e2e/san-1206-broker-viewing-actions.spec.ts
 */
import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  injectSession,
  loadEnvLocalForE2E,
  type ThrowawayIdentity,
} from "./helpers/auth";

const OPT_IN = process.env.SAN1206_BROKER_E2E === "1";

/** 19:00Z is 2:00 PM in Medellín; 20:00Z is 3:00 PM. */
const T_CONFIRM = "2099-11-20T19:00:00.000Z";
const T_RESCHEDULE_FROM = "2099-11-21T19:00:00.000Z";
const T_RESCHEDULE_TO = "2099-11-21T20:00:00.000Z";
/** The offset-free value a `datetime-local` control sends for 3:00 PM Medellín. */
const RESCHEDULE_WALL_CLOCK = "2099-11-21T15:00";
const EXPECTED_TIME_LABEL = /3:00\s*PM/;

const MOBILE_VIEWPORT = { width: 390, height: 844 };

type Fixture = {
  run: string;
  owner: ThrowawayIdentity;
  other: ThrowawayIdentity;
  renter: ThrowawayIdentity;
  landlordProfileId: string;
  apartmentId: string;
  leadIdA: string;
  leadIdB: string;
  showingIdA: string;
  showingIdB: string;
};

/**
 * Refuse to write anywhere but a loopback Supabase. A test that provisions and deletes real
 * rows must not be one misconfigured environment variable away from production.
 */
function assertLocalTarget(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const host = url ? new URL(url).hostname : "";
  const isLoopback =
    host === "127.0.0.1" || host === "localhost" || host === "::1" ||
    (host.startsWith("127.") && host.endsWith("0.0.1"));
  if (!isLoopback) {
    throw new Error(
      `SAN-1206 refuses to run against a non-loopback Supabase host (${host || "unset"}). ` +
        "Point NEXT_PUBLIC_SUPABASE_URL at the local stack.",
    );
  }
}

async function provisionFixture(): Promise<Fixture> {
  const admin = await getSupabaseAdmin();
  const run = `san1206e2e-${randomUUID().slice(0, 8)}`;

  const owner = await createThrowawayIdentity(`${run}-owner`);
  const other = await createThrowawayIdentity(`${run}-other`);
  const renter = await createThrowawayIdentity(`${run}-renter`);

  const landlordProfileId = randomUUID();
  const apartmentId = randomUUID();
  const leadIdA = randomUUID();
  const leadIdB = randomUUID();
  const showingIdA = randomUUID();
  const showingIdB = randomUUID();

  const { error: profileError } = await admin.from("landlord_profiles").insert({
    id: landlordProfileId,
    user_id: owner.userId,
    display_name: `SAN1206 ${run}`,
    verification_status: "approved",
  });
  if (profileError) throw new Error(`landlord_profiles: ${profileError.message}`);

  const { error: apartmentError } = await admin.from("apartments").insert({
    id: apartmentId,
    title: `SAN1206 ${run} apartment`,
    slug: `${run}-apartment`,
    neighborhood: "Laureles",
    status: "active",
    moderation_status: "approved",
    listing_workflow_status: "published",
    landlord_id: landlordProfileId,
    available_to: "2099-12-31",
  });
  if (apartmentError) throw new Error(`apartments: ${apartmentError.message}`);

  const { error: leadsError } = await admin.from("leads").insert([
    {
      id: leadIdA,
      source: "form",
      user_id: renter.userId,
      email: `${run}-renter-a@qa-isolation.mdeai.co`,
      name: `SAN1206 Renter A ${run}`,
      apartment_id: apartmentId,
      preferred_showing_at: T_CONFIRM,
      intent: "rental",
      status: "new",
      pipeline_stage: "showing_scheduled",
      metadata: {},
      idempotency_key: `${run}-lead-a`,
    },
    {
      id: leadIdB,
      source: "form",
      email: `${run}-renter-b@qa-isolation.mdeai.co`,
      name: `SAN1206 Renter B ${run}`,
      apartment_id: apartmentId,
      preferred_showing_at: T_RESCHEDULE_FROM,
      intent: "rental",
      status: "new",
      pipeline_stage: "showing_scheduled",
      metadata: {},
      idempotency_key: `${run}-lead-b`,
    },
  ]);
  if (leadsError) throw new Error(`leads: ${leadsError.message}`);

  const { error: showingsError } = await admin.from("showings").insert([
    { id: showingIdA, lead_id: leadIdA, apartment_id: apartmentId, scheduled_at: T_CONFIRM, status: "scheduled" },
    { id: showingIdB, lead_id: leadIdB, apartment_id: apartmentId, scheduled_at: T_RESCHEDULE_FROM, status: "scheduled" },
  ]);
  if (showingsError) throw new Error(`showings: ${showingsError.message}`);

  return { run, owner, other, renter, landlordProfileId, apartmentId, leadIdA, leadIdB, showingIdA, showingIdB };
}

/** Best-effort, order-correct teardown. Reports what it could not remove instead of hiding it. */
async function cleanupFixture(fixture: Partial<Fixture>): Promise<string[]> {
  const admin = await getSupabaseAdmin();
  const failures: string[] = [];

  const attempt = async (
    label: string,
    fn: () => PromiseLike<{ error: { message: string } | null }>,
  ) => {
    try {
      const { error } = await fn();
      if (error) failures.push(`${label}: ${error.message}`);
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (fixture.apartmentId) {
    // showings and leads cascade from the apartment, but removing them explicitly keeps the
    // teardown correct even if a future FK loses its ON DELETE CASCADE.
    await attempt("showings", () => admin.from("showings").delete().eq("apartment_id", fixture.apartmentId!));
    await attempt("leads", () => admin.from("leads").delete().eq("apartment_id", fixture.apartmentId!));
    await attempt("apartment", () => admin.from("apartments").delete().eq("id", fixture.apartmentId!));
  }
  if (fixture.landlordProfileId) {
    await attempt("landlord_profile", () => admin.from("landlord_profiles").delete().eq("id", fixture.landlordProfileId!));
  }
  if (fixture.owner) {
    const problem = await deleteIdentityVerified(fixture.owner);
    if (problem) failures.push(`owner identity: ${problem}`);
  }
  if (fixture.other) {
    const problem = await deleteIdentityVerified(fixture.other);
    if (problem) failures.push(`other identity: ${problem}`);
  }
  if (fixture.renter) {
    const problem = await deleteIdentityVerified(fixture.renter);
    if (problem) failures.push(`renter identity: ${problem}`);
  }

  return failures;
}

/**
 * Delete a throwaway identity and verify the OUTCOME rather than the helper's silence.
 *
 * The shared helper also purges `mastra_threads`/`mastra_messages`, and those tables are not
 * migration-managed — the local Supabase stack this spec targets has no `mastra_threads` at
 * all, so the helper throws before it reports. What matters is that the identity is gone, so
 * this checks the account directly and only reports a problem it can actually justify.
 */
async function deleteIdentityVerified(identity: ThrowawayIdentity): Promise<string | null> {
  const admin = await getSupabaseAdmin();
  try {
    await deleteThrowawayIdentity(identity);
  } catch {
    // Deliberately swallowed: the outcome check below is the assertion, not this call.
  }

  const { data, error } = await admin.auth.admin.getUserById(identity.userId);
  if (data?.user) {
    return `identity still present: ${identity.email}`;
  }
  if (error && !/not found|does not exist|404/i.test(error.message)) {
    return `identity could not be verified: ${error.message}`;
  }
  return null;
}

/** Prove the run left nothing behind, by marker rather than by assumption. */
async function residueForRun(run: string): Promise<string[]> {
  const admin = await getSupabaseAdmin();
  const found: string[] = [];

  const { count: profileCount } = await admin
    .from("landlord_profiles")
    .select("id", { count: "exact", head: true })
    .ilike("display_name", `%${run}%`);
  if (profileCount) found.push(`${profileCount} landlord_profiles still match ${run}`);

  const { count: leadCount } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .ilike("idempotency_key", `${run}%`);
  if (leadCount) found.push(`${leadCount} leads still match ${run}`);

  const { count: apartmentCount } = await admin
    .from("apartments")
    .select("id", { count: "exact", head: true })
    .ilike("slug", `${run}%`);
  if (apartmentCount) found.push(`${apartmentCount} apartments still match ${run}`);

  return found;
}

/** Count the rows that this run created, in the trusted session. */
async function countShowings(apartmentId: string): Promise<number> {
  const admin = await getSupabaseAdmin();
  const { count, error } = await admin
    .from("showings")
    .select("id", { count: "exact", head: true })
    .eq("apartment_id", apartmentId);
  if (error) throw new Error(`count showings: ${error.message}`);
  return count ?? 0;
}

/**
 * PostgREST renders a timestamptz as `+00:00` while the test constants use `Z`. Both name the
 * same instant, so comparisons normalise through `Date` rather than matching string formats.
 */
function instantOf(value: string): string {
  return new Date(value).toISOString();
}

async function readShowing(showingId: string): Promise<{ status: string; scheduled_at: string }> {
  const admin = await getSupabaseAdmin();
  const { data, error } = await admin
    .from("showings")
    .select("status, scheduled_at")
    .eq("id", showingId)
    .single();
  if (error) throw new Error(`read showing: ${error.message}`);
  return data as { status: string; scheduled_at: string };
}

// skipcq: JS-0067 - module-local test helper; not browser global scope
async function signInBroker(context: BrowserContext, email: string): Promise<void> {
  const session = await getTestSession(email);
  await injectSession(context, session, { host: "localhost", secure: false });
}

/**
 * Hide CopilotKit's development web-inspector.
 *
 * CopilotKit mounts `<cpk-web-inspector>` on localhost and it floats above the page, so it
 * intercepts pointer events aimed at the cards underneath — Playwright reports the click as
 * blocked rather than failing the assertion. It is a development-only overlay, absent from a
 * production build, and unrelated to this task, so it is hidden rather than clicked through
 * with `force: true`: forcing would also skip the visibility and stability checks that are what
 * make this click meaningful in the first place.
 *
 * Registered as an init script so it survives the reloads and fresh navigations below.
 */
async function hideDevOverlay(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const CSS =
      "cpk-web-inspector,.copilotKitDevConsole{display:none !important;pointer-events:none !important}";
    let styled = false;

    // An init script runs before the parser has necessarily created <head>, so appending a
    // style immediately can silently fail. This retries until there is somewhere to put it.
    const apply = () => {
      if (!styled) {
        const target = document.head ?? document.documentElement;
        if (target) {
          const style = document.createElement("style");
          style.textContent = CSS;
          target.appendChild(style);
          styled = true;
        }
      }
      // Belt and braces: the overlay is a custom element, and an inline important rule on the
      // element itself removes it from hit-testing even if a stylesheet is overridden.
      document.querySelectorAll<HTMLElement>("cpk-web-inspector").forEach((el) => {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("pointer-events", "none", "important");
      });
    };

    new MutationObserver(apply).observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", apply);
  });
}

/**
 * Click an action, prove the row changed, then let the caller re-read it through the UI.
 *
 * The retry is not tolerance of a broken feature — it works around a real browser behaviour: a
 * server-rendered button is present in the DOM and clickable *before* React hydrates, so
 * Playwright can report a successful click while no handler is attached yet. A cold dev server
 * makes that window easy to hit. The block below re-clicks only while the persisted row is still
 * unchanged, so it can never loosen the assertion: the row must actually change.
 *
 * The card itself updates through `router.refresh()`, which re-fetches the Server Component.
 * That is framework behaviour this component shares with the rest of the app, so the outcome is
 * asserted against the persisted row and the UI is checked after a full server render.
 */
async function clickAndAwaitPersisted(
  page: Page,
  buttonTestId: string,
  read: () => Promise<boolean>,
  description: string,
): Promise<void> {
  const button = page.getByTestId(buttonTestId);

  await expect(async () => {
    if (await read()) {
      return;
    }
    await button.click({ timeout: 5_000 });
    expect(await read()).toBe(true);
  }, `${description} was never persisted`).toPass({ timeout: 30_000 });
}

/**
 * Reschedule a request through the UI, retrying the whole open → type → submit sequence.
 *
 * The retry covers two real browser behaviours rather than papering over them: the hydration
 * window (a server-rendered button is clickable before React binds its handler) and the panel
 * closing if a re-render lands between typing and submitting. The assertion is unchanged and
 * strict — the persisted time must become the requested one.
 */
async function rescheduleViaUi(
  page: Page,
  showingId: string,
  wallClock: string,
  expectedInstant: string,
): Promise<void> {
  const input = page.getByTestId(`viewing-request-reschedule-input-${showingId}`);
  const submit = page.getByTestId(`viewing-request-reschedule-submit-${showingId}`);

  await expect(async () => {
    if (!(await input.isVisible().catch(() => false))) {
      await page.getByTestId(`viewing-request-reschedule-${showingId}`).click({ timeout: 5_000 });
      await expect(input).toBeVisible({ timeout: 3_000 });
    }

    await input.fill(wallClock, { timeout: 5_000 });
    // A controlled input that never receives the value would leave the submit disabled and the
    // failure would read as "button not found". Assert the value stuck so the error is truthful.
    expect(await input.inputValue()).toBe(wallClock);

    await submit.click({ timeout: 5_000 });
    expect(instantOf((await readShowing(showingId)).scheduled_at)).toBe(expectedInstant);
  }, "the reschedule was never persisted").toPass({ timeout: 45_000 });
}

test.describe("SAN-1206 · broker viewing actions", () => {
  test.skip(!OPT_IN, "Opt-in: set SAN1206_BROKER_E2E=1 with a local Supabase target.");

  // Provisioning, two sign-ins, a fresh dev-server compile and several round trips do not fit
  // the 60s default, and a timeout reports far less than the assertion it interrupted.
  test.setTimeout(180_000);

  // Playwright's action timeout defaults to UNLIMITED, so a single non-actionable control hangs
  // the entire test and reports only "timeout exceeded" with no indication of which step. These
  // bounds turn that into a named failure. They are deliberately generous: the target is a cold
  // dev server, not a warm production edge.
  test.use({ actionTimeout: 20_000, navigationTimeout: 45_000 });

  test("confirm, replay and reschedule land on the same row", async ({ browser }) => {
    loadEnvLocalForE2E();
    if (!hasE2eEnv()) test.skip(true, "E2E Supabase env unavailable");
    assertLocalTarget();

    let fixture: Partial<Fixture> = {};
    let journeyFailure: unknown = null;
    let residue: string[] = [];

    // Desktop for the journey itself: at phone width the broker pane sits behind a
    // "Workspace" tab, which the dedicated mobile check below opens deliberately.
    const context = await browser.newContext();
    await hideDevOverlay(context);
    const page: Page = await context.newPage();

    try {
      fixture = await provisionFixture();
      await signInBroker(context, fixture.owner!.email);

      await page.goto("/host/rentals", { waitUntil: "domcontentloaded" });

      const cardA = page.getByTestId(`viewing-request-${fixture.showingIdA}`);
      const cardB = page.getByTestId(`viewing-request-${fixture.showingIdB}`);
      await expect(cardA).toBeVisible();
      await expect(cardB).toBeVisible();

      // The database stores `scheduled`; the broker must read the decision they still owe.
      await expect(page.getByTestId(`viewing-request-status-${fixture.showingIdA}`)).toHaveText(
        "Requested",
      );
      await expect(page.getByTestId(`viewing-request-confirm-${fixture.showingIdA}`)).toBeVisible();
      await expect(page.getByTestId(`viewing-request-decline-${fixture.showingIdA}`)).toBeVisible();
      await expect(page.getByTestId(`viewing-request-reschedule-${fixture.showingIdA}`)).toBeVisible();

      // ── Confirm ──────────────────────────────────────────────────────────────
      await clickAndAwaitPersisted(
        page,
        `viewing-request-confirm-${fixture.showingIdA}`,
        async () => (await readShowing(fixture.showingIdA!)).status === "confirmed",
        "confirm",
      );

      // A full server render must show the persisted decision.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId(`viewing-request-status-${fixture.showingIdA}`)).toHaveText(
        "Confirmed",
      );
      // A confirmed viewing can still be declined, but is never moved to a new time here.
      await expect(page.getByTestId(`viewing-request-confirm-${fixture.showingIdA}`)).toHaveCount(0);
      await expect(page.getByTestId(`viewing-request-reschedule-${fixture.showingIdA}`)).toHaveCount(0);

      expect((await readShowing(fixture.showingIdA!)).status).toBe("confirmed");

      // ── Replay the identical action ──────────────────────────────────────────
      // A genuine retry re-sends the original expectation. It must be a no-op success, and it
      // must not create a second showing.
      const replay = await page.request.patch(`/api/host/rentals/viewings/${fixture.showingIdA}`, {
        data: {
          action: "confirm",
          expectedStatus: "scheduled",
          expectedScheduledAt: T_CONFIRM,
        },
      });
      expect(replay.status()).toBe(200);
      expect(await countShowings(fixture.apartmentId!)).toBe(2);

      // ── Reschedule 2:00 PM → 3:00 PM on the same row ──────────────────────────
      await rescheduleViaUi(
        page,
        fixture.showingIdB!,
        RESCHEDULE_WALL_CLOCK,
        T_RESCHEDULE_TO,
      );

      const rescheduled = await readShowing(fixture.showingIdB!);
      expect(instantOf(rescheduled.scheduled_at)).toBe(T_RESCHEDULE_TO);
      expect(await countShowings(fixture.apartmentId!)).toBe(2);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId(`viewing-request-time-${fixture.showingIdB}`)).toHaveText(
        EXPECTED_TIME_LABEL,
      );
      // Still unanswered: rescheduling moves the time, it does not answer the request.
      await expect(page.getByTestId(`viewing-request-status-${fixture.showingIdB}`)).toHaveText(
        "Requested",
      );

      // ── Persistence across a reload ──────────────────────────────────────────
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId(`viewing-request-status-${fixture.showingIdA}`)).toHaveText(
        "Confirmed",
      );
      await expect(page.getByTestId(`viewing-request-time-${fixture.showingIdB}`)).toHaveText(
        EXPECTED_TIME_LABEL,
      );

      // ── Decline: the confirmed request's remaining action persists cancellation ─
      await clickAndAwaitPersisted(
        page,
        `viewing-request-decline-${fixture.showingIdA}`,
        async () => (await readShowing(fixture.showingIdA!)).status === "cancelled",
        "decline",
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId(`viewing-request-status-${fixture.showingIdA}`)).toHaveText(
        "Cancelled",
      );
      expect(await countShowings(fixture.apartmentId!)).toBe(2);

      // ── Mobile: the same request and its controls reach a 390px viewport ──────
      //
      // Presence, not visibility: `/host/rentals` renders the workspace in responsive
      // containers, so at phone width the card exists in the DOM inside a pane that is hidden
      // until the "Workspace" tab is selected. This matches the mobile assertion SAN-1204
      // established for the same surface rather than inventing a second, stricter contract for
      // a layout this task does not own. What SAN-1206 must guarantee at 390px is that the
      // action controls exist and do not push the page sideways.
      const mobileContext = await browser.newContext({ viewport: MOBILE_VIEWPORT });
      await hideDevOverlay(mobileContext);
      try {
        await signInBroker(mobileContext, fixture.owner!.email);
        const mobilePage = await mobileContext.newPage();
        await mobilePage.goto("/host/rentals", { waitUntil: "domcontentloaded" });
        await mobilePage.getByRole("button", { name: "Workspace" }).click();

        await expect(
          mobilePage.getByTestId(`viewing-request-${fixture.showingIdB}`),
        ).toHaveCount(1);
        await expect(
          mobilePage.getByTestId(`viewing-request-reschedule-${fixture.showingIdB}`),
        ).toHaveCount(1);
        await expect(
          mobilePage.getByTestId(`viewing-request-status-${fixture.showingIdB}`),
        ).toHaveText("Requested");

        const overflow = await mobilePage.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(
          overflow,
          "the action controls must not push a 390px viewport sideways",
        ).toBeLessThanOrEqual(1);
      } finally {
        await mobileContext.close();
      }

      // ── An unrelated real broker cannot mutate it ────────────────────────────
      const otherContext = await browser.newContext();
      await hideDevOverlay(otherContext);
      try {
        await signInBroker(otherContext, fixture.other!.email);
        const otherPage = await otherContext.newPage();
        await otherPage.goto("/host/rentals", { waitUntil: "domcontentloaded" });

        const denied = await otherPage.request.patch(
          `/api/host/rentals/viewings/${fixture.showingIdB}`,
          {
            data: {
              action: "cancel",
              expectedStatus: "scheduled",
              expectedScheduledAt: T_RESCHEDULE_TO,
            },
          },
        );
        expect(denied.status()).toBe(403);
      } finally {
        await otherContext.close();
      }

      // ── An anonymous caller is refused before the database ───────────────────
      const anonContext = await browser.newContext();
      try {
        const anonPage = await anonContext.newPage();
        const anonymous = await anonPage.request.patch(
          `/api/host/rentals/viewings/${fixture.showingIdB}`,
          {
            data: {
              action: "cancel",
              expectedStatus: "scheduled",
              expectedScheduledAt: T_RESCHEDULE_TO,
            },
          },
        );
        expect(anonymous.status()).toBe(401);
      } finally {
        await anonContext.close();
      }

      // ── The renter who owns the lead cannot use the broker action ────────────
      // `leadIdA` belongs to this identity, so this is the real party the old RLS policy
      // trusted — not an unrelated signed-in user. The RPC still refuses: they do not own the
      // apartment. (The matching direct-table denial is proven in pgTAP I2/I3.)
      const renterContext = await browser.newContext();
      await hideDevOverlay(renterContext);
      try {
        await signInBroker(renterContext, fixture.renter!.email);
        const renterPage = await renterContext.newPage();
        const renterDenied = await renterPage.request.patch(
          `/api/host/rentals/viewings/${fixture.showingIdA}`,
          {
            data: {
              action: "confirm",
              expectedStatus: "scheduled",
              expectedScheduledAt: T_CONFIRM,
            },
          },
        );
        expect(renterDenied.status()).toBe(403);
      } finally {
        await renterContext.close();
      }

      // Nothing above was allowed to touch the rescheduled row.
      const untouched = await readShowing(fixture.showingIdB!);
      expect(untouched.status).toBe("scheduled");
      expect(instantOf(untouched.scheduled_at)).toBe(T_RESCHEDULE_TO);
    } catch (err) {
      journeyFailure = err;
    } finally {
      try {
        residue = await cleanupFixture(fixture);
      } catch (err) {
        residue = [`cleanup threw: ${err instanceof Error ? err.message : String(err)}`];
      }
      await context.close();
    }

    if (journeyFailure) {
      // Report cleanup problems alongside the journey failure instead of letting the
      // cleanup assertion replace it — a failing journey must not hide stranded rows.
      if (residue.length > 0) {
        console.error(`SAN-1206 residue after failing journey:\n${residue.join("\n")}`);
      }
      throw journeyFailure;
    }

    // Absence, verified by marker, not assumed because the deletes returned no error.
    const leftover = fixture.run ? await residueForRun(fixture.run) : [];
    const problems = [...residue, ...leftover];
    expect(problems, `cleanup left rows behind:\n${problems.join("\n")}`).toEqual([]);
  });
});
