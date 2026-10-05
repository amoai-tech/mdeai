import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { establishVercelAutomationBypass, validateVercelCandidateOrigin } from "./fixtures/vercel-bypass";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "./helpers/auth";
import { createClient, type Session } from "@supabase/supabase-js";

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

const OPT_IN = process.env.SAN1205_JOURNEY_E2E === "1";
const ORIGIN = (process.env.PROD_SMOKE_BASE_URL ?? "").trim().replace(/\/$/, "");
const CANDIDATE_SHA = process.env.SAN1205_CANDIDATE_SHA?.trim() ?? "";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

type Admin = Awaited<ReturnType<typeof getSupabaseAdmin>>;

type Fixture = {
  run: string;
  owner: ThrowawayIdentity;
  other: ThrowawayIdentity;
  ownerProfileId: string;
  otherProfileId: string;
  apartmentId: string;
  title: string;
};

/** A fixture whose identities may not exist yet, so a half-built one can still be cleaned. */
type PartialFixture = Omit<Fixture, "owner" | "other"> & {
  owner: ThrowawayIdentity | null;
  other: ThrowawayIdentity | null;
};

type ScheduleBody = {
  success?: boolean;
  leadId?: string;
  showingId?: string;
  error?: { code?: string; message?: string };
};

const route = (p: string) => new URL(p, `${ORIGIN}/`).toString();

/** A Medellín-local `datetime-local` value a few days out, on a whole hour. */
function futureLocalSlot(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

/** Only a real MDE Vercel preview needs the automation bypass; production does not. */
async function openCandidate(page: Page): Promise<void> {
  try {
    validateVercelCandidateOrigin(ORIGIN);
  } catch {
    return;
  }
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) {
    throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required to reach a Vercel preview");
  }
  await establishVercelAutomationBypass(page, ORIGIN, secret);
}

/**
 * Wait until React has attached a click handler to this exact element.
 *
 * Server-rendered markup is visible before hydration, and a click in that window is silently
 * dropped. Polling a fact about the page (the handler exists) is not the same as repeating a
 * click: after this resolves the test clicks once, and if that click does nothing the next
 * assertion fails.
 */
async function waitUntilInteractive(control: Locator, label: string): Promise<void> {
  await expect(control, `${label} must render`).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(
      () =>
        control.evaluate((el) =>
          Object.keys(el).some(
            (key) =>
              key.startsWith("__reactProps$") &&
              typeof (el as unknown as Record<string, { onClick?: unknown }>)[key]?.onClick ===
                "function",
          ),
        ),
      { timeout: 60_000, message: `${label} never became interactive (React did not hydrate)` },
    )
    .toBe(true);
}

/** Open the request form on a listing page. One click; the form must appear. */
async function openRequestForm(page: Page, apartmentId: string): Promise<void> {
  await page.goto(route(`/rentals/${apartmentId}`), { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="rental-detail"]')).toBeVisible({ timeout: 60_000 });

  const cta = page.locator('[data-testid="rental-detail-request-cta"]');
  await waitUntilInteractive(cta, "the Request viewing button");
  await cta.click();
  await expect(
    page.locator('[data-testid="schedule-viewing-modal"]'),
    "one click on Request viewing must open the form",
  ).toBeVisible({ timeout: 10_000 });
}

async function fillRequestForm(
  page: Page,
  renter: { name: string; email: string; phone: string },
  preferredAt: string,
): Promise<void> {
  await page.locator('input[name="name"]').fill(renter.name);
  await page.locator('input[name="email"]').fill(renter.email);
  await page.locator('input[name="phone"]').fill(renter.phone);
  await page.locator('input[name="preferredAt"]').fill(preferredAt);
}

async function submitRequest(page: Page): Promise<{ status: number; body: ScheduleBody }> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/leads/schedule-viewing") && r.request().method() === "POST",
      { timeout: 90_000 },
    ),
    page.locator('[data-testid="schedule-viewing-submit"]').click(),
  ]);
  return { status: response.status(), body: (await response.json()) as ScheduleBody };
}

/** An RLS-scoped client acting as a real signed-in broker. Never service role. */
function asUser(session: Session) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase public env missing");
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

/**
 * The Supabase API now and then answers "Bad Gateway". Setup and cleanup must survive that: a
 * silently skipped delete would strand real rows with a green run as the only evidence.
 */
class NonRetryableError extends Error {}

async function retryCall<T>(label: string, fn: () => PromiseLike<T>, tries = 6): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const result = await fn();
      const error = (result as { error?: { message: string; status?: number } | null } | undefined)
        ?.error;
      if (error) {
        const status = error.status;
        // A 4xx other than 429 is a caller bug; retrying only delays the real failure.
        if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) {
          throw new NonRetryableError(`${label}: ${error.message}`);
        }
        throw new Error(error.message);
      }
      return result;
    } catch (err) {
      if (err instanceof NonRetryableError) throw err;
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
  throw new Error(
    `${label} failed after ${tries} tries: ${last instanceof Error ? last.message : String(last)}`,
  );
}

/** Every renter email this run uses starts with this, so cleanup can find all of them. */
const renterEmail = (run: string, tag: string) => `san1205-${run}-${tag}@qa-isolation.mdeai.co`;

/**
 * Two brokers and one published listing owned by the first.
 *
 * Any failure part-way tears down what already exists before rethrowing; the caller only
 * receives a fixture on success, so it could not do that itself.
 */
async function provisionFixture(admin: Admin, run: string): Promise<Fixture> {
  const fixture: PartialFixture = {
    run,
    owner: null,
    other: null,
    ownerProfileId: randomUUID(),
    otherProfileId: randomUUID(),
    apartmentId: randomUUID(),
    title: `SAN1205 journey ${run}`,
  };

  try {
    fixture.owner = await createThrowawayIdentity(`san1205-owner-${run}`);
    fixture.other = await createThrowawayIdentity(`san1205-other-${run}`);

    await retryCall("broker profiles insert", () =>
      admin.from("landlord_profiles").insert([
        {
          id: fixture.ownerProfileId,
          user_id: fixture.owner!.userId,
          display_name: `SAN1205 Owner ${run}`,
          verification_status: "approved",
        },
        {
          id: fixture.otherProfileId,
          user_id: fixture.other!.userId,
          display_name: `SAN1205 Other ${run}`,
          verification_status: "approved",
        },
      ]),
    );

    await retryCall("apartment insert", () =>
      admin.from("apartments").insert({
        id: fixture.apartmentId,
        title: fixture.title,
        slug: `san1205-journey-${run}`,
        neighborhood: "Laureles",
        address: "SAN1205 test address, Laureles",
        bedrooms: 2,
        bathrooms: 1,
        price_monthly: 2_400_000,
        currency: "COP",
        status: "active",
        moderation_status: "approved",
        listing_workflow_status: "published",
        landlord_id: fixture.ownerProfileId,
        available_to: "2099-12-31",
      }),
    );

    return fixture as Fixture;
  } catch (err) {
    const orphans = await cleanupFixture(admin, fixture);
    if (orphans.length > 0) {
      console.error(`[san-1205] provisioning failed and cleanup was incomplete: ${orphans.join("; ")}`);
    }
    throw err;
  }
}

/** Attempt every cleanup step and report everything that failed. */
async function cleanupFixture(admin: Admin, fixture: PartialFixture): Promise<string[]> {
  const failures: string[] = [];
  const step = async (label: string, fn: () => PromiseLike<unknown>) => {
    try {
      await retryCall(label, fn);
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Find leads by this run's email prefix AND by apartment, so a request that landed on the
  // wrong listing, or a failure-path request, is still cleaned up.
  const leadIds = new Set<string>();
  for (const [label, query] of [
    [
      "find leads by email",
      () => admin.from("leads").select("id").ilike("email", `san1205-${fixture.run}-%`),
    ],
    [
      "find leads by apartment",
      () => admin.from("leads").select("id").eq("apartment_id", fixture.apartmentId),
    ],
  ] as const) {
    try {
      const { data } = await retryCall(label, query);
      // No data without an error is an unknown answer, not "no leads". Cleanup must not skip
      // rows because a lookup returned nothing it could trust.
      if (!data) throw new Error("lookup returned no result");
      for (const row of data as Array<{ id: string }>) leadIds.add(row.id);
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await step("delete showings by apartment", () =>
    admin.from("showings").delete().eq("apartment_id", fixture.apartmentId),
  );
  if (leadIds.size > 0) {
    await step("delete showings by lead", () =>
      admin.from("showings").delete().in("lead_id", [...leadIds]),
    );
    await step("delete leads", () => admin.from("leads").delete().in("id", [...leadIds]));
  }
  await step("delete apartment", () =>
    admin.from("apartments").delete().eq("id", fixture.apartmentId),
  );
  await step("delete broker profiles", () =>
    admin
      .from("landlord_profiles")
      .delete()
      .in("id", [fixture.ownerProfileId, fixture.otherProfileId]),
  );

  for (const [who, identity] of [
    ["owner", fixture.owner],
    ["other", fixture.other],
  ] as const) {
    if (!identity) continue;
    try {
      await retryCall(`delete ${who} identity`, () => deleteThrowawayIdentity(identity));
    } catch (err) {
      failures.push(`identity/${who}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return failures;
}

/** Prove the rows are gone by asking again, rather than trusting the deletes. */
async function findResidue(admin: Admin, fixture: Fixture): Promise<string[]> {
  const leftovers: string[] = [];
  const count = async (
    label: string,
    query: () => PromiseLike<{ count: number | null; error: unknown }>,
  ) => {
    try {
      const { count: found } = await retryCall(label, query);
      if (found === null) {
        // An unknown answer is not zero. "Could not verify" must fail the run.
        leftovers.push(`${label}: residue count unavailable, cannot prove zero rows remain`);
      } else if (found > 0) {
        leftovers.push(`${label}: ${found} row(s) remain`);
      }
    } catch (err) {
      // A failed count must never be reported as "no residue".
      leftovers.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  await count("leads by email", () =>
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .ilike("email", `san1205-${fixture.run}-%`),
  );
  await count("leads by apartment", () =>
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("apartment_id", fixture.apartmentId),
  );
  await count("showings by apartment", () =>
    admin
      .from("showings")
      .select("id", { count: "exact", head: true })
      .eq("apartment_id", fixture.apartmentId),
  );
  await count("apartment", () =>
    admin.from("apartments").select("id", { count: "exact", head: true }).eq("id", fixture.apartmentId),
  );
  await count("broker profiles", () =>
    admin
      .from("landlord_profiles")
      .select("id", { count: "exact", head: true })
      .in("id", [fixture.ownerProfileId, fixture.otherProfileId]),
  );

  for (const [who, userId] of [
    ["owner", fixture.owner.userId],
    ["other", fixture.other.userId],
  ] as const) {
    try {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        // 404 is the expected answer once the user is gone; anything else is unverified.
        if ((error as { status?: number }).status !== 404) {
          leftovers.push(`auth user/${who}: could not verify (${error.message})`);
        }
      } else if (data?.user) {
        leftovers.push(`auth user/${who}: still present`);
      }
    } catch (err) {
      leftovers.push(`auth user/${who}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return leftovers;
}

/** Row counts for everything a request could write, by apartment and by this run's emails. */
async function countRequestRows(admin: Admin, fixture: Fixture) {
  const leads = await retryCall("count leads", () =>
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .or(`apartment_id.eq.${fixture.apartmentId},email.ilike.san1205-${fixture.run}-*`),
  );
  const showings = await retryCall("count showings", () =>
    admin
      .from("showings")
      .select("id", { count: "exact", head: true })
      .eq("apartment_id", fixture.apartmentId),
  );
  if (leads.count === null || showings.count === null) {
    throw new Error("row count unavailable: an unknown count must never be treated as zero");
  }
  return { leads: leads.count, showings: showings.count };
}

async function openBrokerWorkspace(browser: Browser, email: string, viewport?: typeof MOBILE_VIEWPORT) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  // Sign-in clears the cookie jar, so the preview handshake has to happen after it.
  await signInAsOnOrigin(page, ORIGIN, email);
  await openCandidate(page);
  await page.goto(route("/host/rentals"), { waitUntil: "domcontentloaded" });
  return { context, page };
}

test.describe.configure({ mode: "serial" });

test.describe("SAN-1205 · a renter's viewing request reaches the correct broker", () => {
  test.skip(
    !OPT_IN || !ORIGIN || !hasE2eEnv(),
    "Opt-in only: needs SAN1205_JOURNEY_E2E=1, PROD_SMOKE_BASE_URL and live Supabase env.",
  );

  test("request, ownership, isolation, failure, replay and cleanup", async ({ browser }) => {
    test.setTimeout(600_000);
    // This test writes real rows. The database decides whether that is production, not the web
    // address: a local or preview site still writes to whatever Supabase project is configured.
    const dbHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid").hostname;
    const dbIsLocal = ["localhost", "127.0.0.1", "[::1]"].includes(dbHost);
    if (!dbIsLocal && process.env.SAN1205_ALLOW_PRODUCTION_WRITES !== "1") {
      throw new Error(
        "SAN-1205 writes and deletes real rows in the configured Supabase project, which is not " +
          "local. Set SAN1205_ALLOW_PRODUCTION_WRITES=1 to confirm that is intended.",
      );
    }

    const admin = await getSupabaseAdmin();
    const run = randomUUID().slice(0, 8);
    // Printed before anything is created, so rows stranded by a killed run can be found.
    console.log(`SAN-1205 fixture run: ${run}  (rows: SAN1205 * ${run}, san1205-*-${run}-* emails)`);
    const fixture = await provisionFixture(admin, run);

    // The journey failure is captured, not thrown from `finally`: a cleanup error thrown there
    // would replace it and hide why the product actually failed.
    let journeyFailure: unknown;
    try {
      const renter = {
        name: `Sofia ${run}`,
        email: renterEmail(run, "renter"),
        phone: "+57 3000000000",
      };
      const slot = futureLocalSlot(3);

      // ── 1 · a renter requests a viewing through the real form ─────────────────
      const renterCtx = await browser.newContext();
      const renterPage = await renterCtx.newPage();
      await openCandidate(renterPage);
      await openRequestForm(renterPage, fixture.apartmentId);
      await fillRequestForm(renterPage, renter, slot);
      const first = await submitRequest(renterPage);

      expect(first.status, `request failed: ${JSON.stringify(first.body)}`).toBe(200);
      expect(first.body.success).toBe(true);
      expect(first.body.leadId, "a committed lead id is required").toBeTruthy();
      expect(first.body.showingId, "a committed showing id is required").toBeTruthy();
      // The confirmation card only exists inside the chat shell, so on the listing page the
      // visible signal is that the form closed without an error. A visible "request sent"
      // message on this page is a separate product gap; this test must not pretend it exists.
      await expect(
        renterPage.locator('[data-testid="schedule-viewing-modal"]'),
        "the form must close after a committed request",
      ).toBeHidden({ timeout: 30_000 });
      await expect(renterPage.locator('[data-testid="schedule-viewing-error"]')).toHaveCount(0);

      // ── 2 · exactly one lead and one showing, tied to this listing ────────────
      const { data: leads, error: leadsError } = await admin
        .from("leads")
        .select("id, apartment_id, email, status")
        .eq("apartment_id", fixture.apartmentId);
      expect(leadsError, "the lead query itself must succeed").toBeNull();
      expect(leads, "exactly one lead for this listing").toHaveLength(1);
      expect(leads![0].id).toBe(first.body.leadId);
      expect(leads![0].email).toBe(renter.email);

      const { data: showings, error: showingsError } = await admin
        .from("showings")
        .select("id, lead_id, apartment_id, status")
        .eq("apartment_id", fixture.apartmentId);
      expect(showingsError, "the showing query itself must succeed").toBeNull();
      expect(showings, "exactly one showing for this listing").toHaveLength(1);
      expect(showings![0].id).toBe(first.body.showingId);
      expect(showings![0].lead_id).toBe(first.body.leadId);

      // ── 3 · replaying the identical request creates nothing new ───────────────
      const replay = await renterPage.request.post(route("/api/leads/schedule-viewing"), {
        data: {
          listingId: fixture.apartmentId,
          listingTitle: fixture.title,
          neighborhood: "Laureles",
          name: renter.name,
          email: renter.email,
          phone: renter.phone,
          preferredAt: slot,
        },
      });
      const replayBody = (await replay.json()) as ScheduleBody;
      expect(replay.status(), `replay failed: ${JSON.stringify(replayBody)}`).toBe(200);
      expect(replayBody.leadId, "a replay must return the same lead").toBe(first.body.leadId);
      expect(replayBody.showingId, "a replay must return the same showing").toBe(
        first.body.showingId,
      );
      expect(await countRequestRows(admin, fixture)).toEqual({ leads: 1, showings: 1 });

      // ── 4 · bad requests fail safely and write nothing ────────────────────────
      const before = await countRequestRows(admin, fixture);
      const valid = {
        listingId: fixture.apartmentId,
        listingTitle: fixture.title,
        neighborhood: "Laureles",
        name: renter.name,
        phone: renter.phone,
        preferredAt: slot,
      };
      const badRequests = [
        { why: "time in the past", data: { ...valid, email: renterEmail(run, "past"), preferredAt: "2020-01-01T10:00" } },
        { why: "invalid email", data: { ...valid, email: "not-an-email" } },
        { why: "missing time", data: { ...valid, email: renterEmail(run, "notime"), preferredAt: undefined } },
      ];
      for (const bad of badRequests) {
        const res = await renterPage.request.post(route("/api/leads/schedule-viewing"), {
          data: bad.data,
        });
        const body = (await res.json()) as ScheduleBody;
        expect(res.status(), `${bad.why} must be refused`).toBe(400);
        expect(body.success, `${bad.why} must not succeed`).toBe(false);
        expect(body.error?.code, `${bad.why} must be a validation error`).toBe("VALIDATION_ERROR");
      }

      // A listing that does not exist must not produce a lead for it.
      const ghost = await renterPage.request.post(route("/api/leads/schedule-viewing"), {
        data: {
          ...valid,
          listingId: randomUUID(),
          email: renterEmail(run, "ghost"),
        },
      });
      const ghostBody = (await ghost.json()) as ScheduleBody;
      expect(ghostBody.success, "a request for a missing listing must not succeed").not.toBe(true);
      expect(ghostBody.showingId, "no showing may exist for a missing listing").toBeUndefined();

      expect(
        await countRequestRows(admin, fixture),
        "refused requests must write no rows",
      ).toEqual(before);

      // The form tells the renter and keeps what they typed when the server cannot commit.
      await renterPage.route("**/api/leads/schedule-viewing", (r) =>
        r.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: { code: "SHOWING_NOT_COMMITTED", message: "The viewing was not committed — please try again." },
          }),
        }),
      );
      const retryEmail = renterEmail(run, "uifail");
      await openRequestForm(renterPage, fixture.apartmentId);
      await fillRequestForm(renterPage, { ...renter, email: retryEmail }, slot);
      const failed = await submitRequest(renterPage);
      expect(failed.status).toBe(502);
      await expect(renterPage.locator('[data-testid="schedule-viewing-error"]')).toBeVisible();
      await expect(
        renterPage.locator('[data-testid="schedule-viewing-modal"]'),
        "the form must stay open after a failure",
      ).toBeVisible();
      await expect(renterPage.locator('input[name="email"]')).toHaveValue(retryEmail);
      await expect(
        renterPage.getByText(/viewing request(ed| received)/i),
        "a request that was not saved must never say it was",
      ).toHaveCount(0);
      await expect(renterPage.locator('[data-testid="lead-confirmation-card"]')).toHaveCount(0);
      await renterPage.unroute("**/api/leads/schedule-viewing");
      await renterCtx.close();

      // ── 5 · the owning broker sees the exact request, once, and after a refresh ─
      const owner = await openBrokerWorkspace(browser, fixture.owner.email);
      const ownerCard = owner.page.locator(`[data-showing-id="${first.body.showingId}"]`);
      await expect(ownerCard, "owning broker must see the exact showing").toHaveCount(1, {
        timeout: 60_000,
      });
      await expect(owner.page.locator(`[data-lead-id="${first.body.leadId}"]`)).toHaveCount(1);
      await expect(ownerCard).toHaveAttribute("data-apartment-id", fixture.apartmentId);
      await expect(ownerCard).toContainText(fixture.title);
      await owner.page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        owner.page.locator(`[data-showing-id="${first.body.showingId}"]`),
        "the request must survive a refresh without duplicating",
      ).toHaveCount(1, { timeout: 60_000 });

      const ownerSession = await getTestSession(fixture.owner.email);
      const ownerDb = asUser(ownerSession);
      const ownerLeads = await ownerDb.from("leads").select("id").eq("apartment_id", fixture.apartmentId);
      const ownerShowings = await ownerDb
        .from("showings")
        .select("id")
        .eq("apartment_id", fixture.apartmentId);
      expect(ownerLeads.error, "the owner's lead query must succeed").toBeNull();
      expect(ownerShowings.error, "the owner's showing query must succeed").toBeNull();
      expect(ownerLeads.data, "owner reads exactly the one lead").toHaveLength(1);
      expect(ownerShowings.data, "owner reads exactly the one showing").toHaveLength(1);

      const ownerApi = await owner.page.request.get(
        route(`/api/host/rentals/listings/${fixture.apartmentId}/detail`),
      );
      expect(ownerApi.status(), "the owning broker is allowed").toBe(200);
      const ownerApiBody = (await ownerApi.json()) as {
        leads: Array<{ id: string }>;
        showings: Array<{ id: string }>;
      };
      expect(ownerApiBody.leads.map((l) => l.id)).toEqual([first.body.leadId]);
      expect(ownerApiBody.showings.map((s) => s.id)).toEqual([first.body.showingId]);
      await owner.context.close();

      // Phone width: the same request must be reachable behind the Workspace tab.
      const mobile = await openBrokerWorkspace(browser, fixture.owner.email, MOBILE_VIEWPORT);
      const workspaceTab = mobile.page.getByRole("button", { name: "Workspace" });
      await waitUntilInteractive(workspaceTab, "the Workspace tab");
      await workspaceTab.click();
      await expect(
        mobile.page.locator(`[data-showing-id="${first.body.showingId}"]`),
        "owning broker must see the request on a phone",
      ).toHaveCount(1, { timeout: 30_000 });
      await mobile.context.close();

      // ── 6 · an unrelated broker is denied at the database, the API and the screen ─
      const other = await openBrokerWorkspace(browser, fixture.other.email);
      const otherSession = await getTestSession(fixture.other.email);
      const otherDb = asUser(otherSession);
      const otherLeads = await otherDb.from("leads").select("id").eq("apartment_id", fixture.apartmentId);
      const otherShowings = await otherDb
        .from("showings")
        .select("id")
        .eq("apartment_id", fixture.apartmentId);
      // A failed query also returns no rows, so prove the query worked before trusting "zero".
      expect(otherLeads.error, "the other broker's lead query must succeed, not fail").toBeNull();
      expect(otherShowings.error, "the other broker's showing query must succeed, not fail").toBeNull();
      expect(otherLeads.data, "RLS must hide the lead from another broker").toEqual([]);
      expect(otherShowings.data, "RLS must hide the showing from another broker").toEqual([]);

      const otherApi = await other.page.request.get(
        route(`/api/host/rentals/listings/${fixture.apartmentId}/detail`),
      );
      expect(otherApi.status(), "the API must refuse a non-owning broker").toBe(403);

      await expect(
        other.page.locator('[data-testid="rc-right"]'),
        "the unrelated broker still gets a workspace",
      ).toHaveCount(1, { timeout: 60_000 });
      await expect(
        other.page.locator(`[data-showing-id="${first.body.showingId}"]`),
        "the screen must not show another broker's showing",
      ).toHaveCount(0);
      await expect(
        other.page.locator(`[data-lead-id="${first.body.leadId}"]`),
        "the screen must not show another broker's lead",
      ).toHaveCount(0);
      await other.context.close();
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
