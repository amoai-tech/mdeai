import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { establishVercelAutomationBypass, validateVercelCandidateOrigin } from "./fixtures/vercel-bypass";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "./helpers/auth";
import { E2E_FIXTURE_METADATA } from "./helpers/rental-fixture-marker";

/**
 * SAN-1204 · MDE Rentals — Show Real Viewing Requests to the Correct Broker.
 *
 * This is the user-facing half of the broker-isolation story. SAN-476 proves the database
 * boundary; this proves a real broker, signed in normally through production auth, actually
 * SEES their own viewing request in `/host/rentals` — and that a different broker, and an
 * anonymous visitor, do not.
 *
 * Opt-in, exactly like the other production specs: it needs live Supabase credentials and it
 * creates real rows, so it must never run unattended in CI.
 *
 *   SAN1204_BROKER_E2E=1 PROD_SMOKE_BASE_URL=<preview-or-prod-url> \
 *     npx playwright test e2e/san-1204-broker-viewing-requests.spec.ts \
 *       --project=prod-smoke --retries=0
 *
 * Everything it creates is deleted at the end, cleanup is then verified by re-querying, and
 * failures are reported rather than swallowed — a green run must never leave a stray listing.
 */

const OPT_IN = process.env.SAN1204_BROKER_E2E === "1";
const ORIGIN = process.env.PROD_SMOKE_BASE_URL ?? "";

/**
 * 19:00Z is 2:00 PM in America/Bogota, the listing timezone. A viewing label rendered in the
 * server's zone (Vercel runs UTC) reads 7:00 PM, so this pins the exact defect SAN-1204 fixed.
 */
const SCHEDULED_AT = "2099-11-20T19:00:00.000Z";
const EXPECTED_TIME = /2:00\s*PM/;
const WRONG_SERVER_ZONE_TIME = /7:00\s*PM/;

const MOBILE_VIEWPORT = { width: 390, height: 844 };

/**
 * Vercel preview deployments sit behind SSO. Reuse the repository's automation bypass secret so
 * the exact PR preview can be tested instead of production. `.env` belongs to the team that owns
 * the mdeai project, so it wins over `.env.local`, which may hold a different team's secret.
 */
// skipcq: JS-0067 - module-local helper
function readSecretFrom(file: string): string | undefined {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^VERCEL_AUTOMATION_BYPASS_SECRET=(.*)$/.exec(line.trim());
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

function resolveBypassSecret(): string | undefined {
  // `.env` is read first on purpose: it belongs to the team that owns the mdeai project, while
  // `.env.local` can hold a different team's secret that the preview rejects. Playwright also
  // auto-loads dotenv, so an inherited process.env value may be the wrong one — the files win.
  return readSecretFrom(".env") ?? readSecretFrom(".env.local") ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
}

const BYPASS_SECRET = resolveBypassSecret();

/** Only a real MDE Vercel candidate needs the automation bypass; production does not. */
// skipcq: JS-0067 - module-local helper
function isVercelCandidate(origin: string): boolean {
  try {
    validateVercelCandidateOrigin(origin);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hand the bypass secret to the candidate handshake only, then let the `_vercel_jwt` cookie set by
 * that response carry the session. Attaching the secret as context-wide `extraHTTPHeaders` would
 * send it on every request the page makes, which is not what the secret is for.
 */
// skipcq: JS-0067 - module-local helper
async function openCandidate(page: Page, origin: string): Promise<void> {
  if (!isVercelCandidate(origin)) return; // production is not protected
  if (!BYPASS_SECRET) {
    // Fail loudly. Silently skipping would surface later as a Vercel login page, which reads
    // like a product defect rather than a missing secret.
    throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required to reach a Vercel candidate");
  }
  await establishVercelAutomationBypass(page, origin, BYPASS_SECRET);
}

type Admin = Awaited<ReturnType<typeof getSupabaseAdmin>>;

type Fixture = {
  owner: ThrowawayIdentity;
  other: ThrowawayIdentity;
  ownerProfileId: string;
  otherProfileId: string;
  apartmentId: string;
  slug: string;
  idempotencyKey: string;
  leadId: string | null;
  showingId: string | null;
};
/**
 * A fixture whose identities may not exist yet. Provisioning creates live production rows one at
 * a time, so a failure part-way must still be able to clean up what already exists.
 */
type PartialFixture = Omit<Fixture, "owner" | "other"> & {
  owner: ThrowawayIdentity | null;
  other: ThrowawayIdentity | null;
};


/** Console errors and genuinely failed application requests, for this origin. */
type Problems = { consoleErrors: string[]; failedRequests: string[] };

/**
 * Console errors that are NOT about viewing-request visibility and are owned by another task.
 *
 * Kept deliberately narrow and named, rather than dropping the console check: the broker
 * concierge mounts the CopilotKit chat runtime, which probes `/api/copilotkit`. That endpoint
 * answers 401 on a Vercel preview (production answers 308), so the client logs
 * `runtime_info_fetch_failed`. Wiring broker chat is SAN-1124 — explicitly outside SAN-1204 —
 * and this failing does not affect whether the owning broker sees their request.
 *
 * Every other console error still fails this test.
 */
const OUT_OF_SCOPE_CONSOLE_ERRORS: RegExp[] = [/\[CopilotKit\].*runtime_info_fetch_failed/];

/** Vercel's own SSO probe is platform infrastructure, not an application request. */
// skipcq: JS-0067 - module-local helper
function isPlatformNoise(url: string): boolean {
  return url.includes("/.well-known/vercel/");
}

// skipcq: JS-0067 - module-local helper
function watchProblems(page: Page): Problems {
  const problems: Problems = { consoleErrors: [], failedRequests: [] };

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (OUT_OF_SCOPE_CONSOLE_ERRORS.some((pattern) => pattern.test(text))) return;
    problems.consoleErrors.push(text);
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    const errorText = request.failure()?.errorText ?? "";
    // ERR_ABORTED is a cancellation, not a failure: Next.js aborts RSC prefetches when the
    // page navigates or the context closes, and Vercel's SSO probe is aborted once the
    // protection bypass header is present. Counting those would make the check meaningless.
    if (errorText.includes("ERR_ABORTED")) return;
    if (isPlatformNoise(url)) return;
    if (url.startsWith(ORIGIN)) {
      problems.failedRequests.push(`${request.method()} ${url} — ${errorText || "unknown"}`);
    }
  });

  // A response the app actually rejected is the real signal.
  page.on("response", (response) => {
    const url = response.url();
    if (!url.startsWith(ORIGIN)) return;
    if (isPlatformNoise(url)) return;
    if (response.status() >= 400) {
      problems.failedRequests.push(`${response.status()} ${url}`);
    }
  });

  return problems;
}

/** Open an isolated context, sign in as `email`, and land on the broker workspace. */
async function openWorkspace(
  browser: Browser,
  email: string,
  viewport?: { width: number; height: number },
): Promise<{ context: BrowserContext; page: Page; problems: Problems }> {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  const problems = watchProblems(page);

  // Sign-in clears the cookie jar, so the bypass handshake has to happen after it.
  await signInAsOnOrigin(page, ORIGIN, email);
  await openCandidate(page, ORIGIN);
  await page.goto(`${ORIGIN}/host/rentals`, { waitUntil: "domcontentloaded" });

  return { context, page, problems };
}

/** Exactly one visible card, matching the persisted lead and showing. */
async function assertSingleRequest(page: Page, fixture: Fixture): Promise<void> {
  await expect(
    page.locator(`[data-showing-id="${fixture.showingId}"]`),
    "the exact persisted showing must render",
  ).toHaveCount(1, { timeout: 60_000 });
  await expect(
    page.locator(`[data-lead-id="${fixture.leadId}"]`),
    "one logical request must render exactly one card",
  ).toHaveCount(1);
}

/** Apartment, renter, status and the listing-local time all come from persisted data. */
async function assertRequestContent(page: Page, fixture: Fixture, run: string): Promise<void> {
  const card = page.locator(`[data-showing-id="${fixture.showingId}"]`);

  await expect(card, "card must be tied to the persisted apartment").toHaveAttribute(
    "data-apartment-id",
    fixture.apartmentId,
  );
  await expect(card).toContainText(`SAN1204 requestable ${run}`);
  await expect(card).toContainText(`Sofia ${run}`);
  await expect(card).toContainText(/scheduled/i);
  await expect(
    card.locator(`[data-testid="viewing-request-time-${fixture.showingId}"]`),
    "the viewing time must be the listing-local time, not the server's",
  ).toContainText(EXPECTED_TIME);
  await expect(card).not.toContainText(WRONG_SERVER_ZONE_TIME);
}

/** A refresh must not duplicate or lose the request. */
async function assertSurvivesRefresh(page: Page, fixture: Fixture): Promise<void> {
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertSingleRequest(page, fixture);
}

/** The owning broker sees the exact request, once, and keeps seeing it after a refresh. */
async function assertOwnerSees(browser: Browser, fixture: Fixture, run: string): Promise<Problems> {
  const { context, page, problems } = await openWorkspace(browser, fixture.owner.email);

  await assertSingleRequest(page, fixture);
  await assertRequestContent(page, fixture, run);
  await assertSurvivesRefresh(page, fixture);

  await context.close();
  return problems;
}

/** A different broker reaches the same workspace, but not that request. */
async function assertOtherDenied(browser: Browser, fixture: Fixture): Promise<Problems> {
  const { context, page, problems } = await openWorkspace(browser, fixture.other.email);

  await expect(
    page.locator('[data-testid="rc-right"]'),
    "the unrelated broker still gets a workspace",
  ).toHaveCount(1, { timeout: 60_000 });
  await expect(
    page.locator(`[data-showing-id="${fixture.showingId}"]`),
    "unrelated broker must NOT see the request",
  ).toHaveCount(0);
  await expect(
    page.locator(`[data-lead-id="${fixture.leadId}"]`),
    "unrelated broker must NOT see the lead",
  ).toHaveCount(0);

  await context.close();
  return problems;
}

/** With no session at all, the broker workspace must not render. */
async function assertAnonymousDenied(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await openCandidate(page, ORIGIN);
  await page.goto(`${ORIGIN}/host/rentals`, { waitUntil: "domcontentloaded" });

  await expect(
    page.locator('[data-testid="rentals-broker-workspace"]'),
    "an anonymous visitor must not get the broker workspace",
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

  await context.close();
}

/** At phone width the workspace pane sits behind the Workspace tab; it must reveal the request. */
async function assertMobileWorkspace(browser: Browser, fixture: Fixture): Promise<Problems> {
  const { context, page, problems } = await openWorkspace(
    browser,
    fixture.owner.email,
    MOBILE_VIEWPORT,
  );

  await page.getByRole("button", { name: "Workspace" }).click();
  await assertSingleRequest(page, fixture);

  await context.close();
  return problems;
}

/**
 * Two brokers — one owns the listing, one owns something else.
 *
 * Every row is created inside the try, and any failure tears down what already exists before
 * rethrowing. The caller cannot do that itself: it only receives a fixture on success, so a
 * throw here would otherwise strand live production rows with nothing able to clean them up.
 */
async function provisionFixture(admin: Admin, run: string): Promise<Fixture> {
  const fixture: PartialFixture = {
    owner: null,
    other: null,
    ownerProfileId: randomUUID(),
    otherProfileId: randomUUID(),
    apartmentId: randomUUID(),
    slug: `san1204-proof-${run}`,
    idempotencyKey: `san1204-${run}`,
    leadId: null,
    showingId: null,
  };

  try {
    return await fillFixture(admin, fixture, run);
  } catch (err) {
    const orphans = await cleanupFixture(admin, fixture);
    if (orphans.length > 0) {
      // Never silent: an incomplete teardown during provisioning is real production residue.
      console.error(`[san-1204] provisioning failed and cleanup was incomplete: ${orphans.join("; ")}`);
    }
    throw err;
  }
}

/** Create the identities and rows, then narrow the fixture to its fully provisioned shape. */
async function fillFixture(
  admin: Admin,
  fixture: PartialFixture,
  run: string,
): Promise<Fixture> {
  fixture.owner = await createThrowawayIdentity(`san1204-owner-${run}`);
  fixture.other = await createThrowawayIdentity(`san1204-other-${run}`);

  const owner = fixture.owner;
  const other = fixture.other;
  if (!owner || !other) {
    throw new Error("SAN-1204 fixture identities were not created");
  }

  const { error: profilesError } = await admin.from("landlord_profiles").insert([
    {
      id: fixture.ownerProfileId,
      user_id: owner.userId,
      display_name: `SAN1204 Owner ${run}`,
      verification_status: "approved",
    },
    {
      id: fixture.otherProfileId,
      user_id: other.userId,
      display_name: `SAN1204 Other ${run}`,
      verification_status: "approved",
    },
  ]);
  if (profilesError) throw new Error(`broker profiles insert failed: ${profilesError.message}`);

  const { error: apartmentError } = await admin.from("apartments").insert({
    id: fixture.apartmentId,
    title: `SAN1204 requestable ${run}`,
    slug: fixture.slug,
    neighborhood: "Laureles",
    status: "active",
    moderation_status: "approved",
    listing_workflow_status: "published",
    landlord_id: fixture.ownerProfileId,
    available_to: "2099-12-31",
    metadata: E2E_FIXTURE_METADATA,
  });
  if (apartmentError) throw new Error(`apartment insert failed: ${apartmentError.message}`);

  return { ...fixture, owner, other };
}

/** Create the request through the real atomic RPC, not by hand, then capture its exact ids. */
async function seedRequest(admin: Admin, fixture: Fixture, run: string): Promise<void> {
  const { error: rpcError } = await admin.rpc("p1_schedule_tour_atomic", {
    p_listing_id: fixture.slug,
    p_user_id: null,
    p_idempotency_key: fixture.idempotencyKey,
    p_source: "form",
    p_email: `san1204-renter-${run}@qa-isolation.mdeai.co`,
    p_name: `Sofia ${run}`,
    p_phone: null,
    p_trip_id: null,
    p_scheduled_at: SCHEDULED_AT,
    p_lead_metadata: {},
    p_showing_metadata: {},
  });
  if (rpcError) throw new Error(`p1_schedule_tour_atomic failed: ${rpcError.message}`);

  // Retried on purpose: cleanup deletes by these ids, so a transient Supabase failure here would
  // leave leadId/showingId null and strand the rows the RPC just committed.
  const leadResult = await retryCall("lead lookup", () =>
    admin.from("leads").select("id").eq("idempotency_key", fixture.idempotencyKey),
  );
  fixture.leadId = leadResult.data?.[0]?.id ?? null;
  if (!fixture.leadId) throw new Error("the RPC must have committed one lead");

  const showingResult = await retryCall("showing lookup", () =>
    admin.from("showings").select("id").eq("lead_id", fixture.leadId!),
  );
  fixture.showingId = showingResult.data?.[0]?.id ?? null;
  if (!fixture.showingId) throw new Error("the RPC must have committed one showing");
}

/**
 * The Supabase API intermittently answers "Bad Gateway". Cleanup must survive that, because a
 * transient 502 that silently skipped a delete would strand real production rows.
 */
// skipcq: JS-0067 - module-local helper
/** An error retrying cannot fix — a bad UUID, an RLS denial, a constraint violation. */
class NonRetryableError extends Error {}

async function retryCall<T>(label: string, fn: () => PromiseLike<T>, tries = 6): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const result = await fn();
      const error = (result as { error?: { message: string; status?: number } | null } | undefined)
        ?.error;
      if (error) {
        // 4xx (except 429) is a caller bug. Retrying it six times over ~12s only delays the
        // real failure and buries the cause.
        const status = error.status;
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
  throw new Error(`${label} failed after ${tries} tries: ${last instanceof Error ? last.message : String(last)}`);
}

/** Real production rows: attempt every step, and report everything that failed. */
async function cleanupFixture(admin: Admin, fixture: PartialFixture): Promise<string[]> {
  const failures: string[] = [];

  const step = async (label: string, fn: () => PromiseLike<unknown>) => {
    try {
      await retryCall(label, fn);
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (fixture.showingId) {
    await step("delete showing", () =>
      admin.from("showings").delete().eq("id", fixture.showingId!),
    );
  }
  if (fixture.leadId) {
    await step("delete lead", () => admin.from("leads").delete().eq("id", fixture.leadId!));
  }
  await step("delete apartment", () =>
    admin.from("apartments").delete().eq("id", fixture.apartmentId),
  );
  await step("delete profiles", () =>
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
      failures.push(`identities/${who}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return failures;
}

/** Prove the fixture rows are actually gone rather than trusting the deletes. */
async function assertNoResidue(admin: Admin, fixture: Fixture): Promise<string[]> {
  const leftovers: string[] = [];

  // skipcq: JS-0067 - module-local helper
  const count = async (label: string, query: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const { count: found } = await retryCall(label, query);
      if ((found ?? 0) > 0) leftovers.push(`${label}: ${found} row(s) remain`);
    } catch (err) {
      // A failed count must never be reported as "no residue".
      leftovers.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (fixture.leadId) {
    await count("lead", () =>
      admin.from("leads").select("id", { count: "exact", head: true }).eq("id", fixture.leadId!),
    );
  }
  if (fixture.showingId) {
    await count("showing", () =>
      admin.from("showings").select("id", { count: "exact", head: true }).eq("id", fixture.showingId!),
    );
  }
  await count("apartment", () =>
    admin.from("apartments").select("id", { count: "exact", head: true }).eq("id", fixture.apartmentId),
  );
  await count("landlord_profiles", () =>
    admin
      .from("landlord_profiles")
      .select("id", { count: "exact", head: true })
      .in("id", [fixture.ownerProfileId, fixture.otherProfileId]),
  );
  // Ask Supabase Auth directly. The previous version re-queried landlord_profiles and labelled
  // the result "auth users", so it could never have caught the stranded auth.users rows that
  // actually happened — the exact failure this postcondition exists to prevent.
  for (const [who, userId] of [
    ["owner", fixture.owner.userId],
    ["other", fixture.other.userId],
  ] as const) {
    try {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        // 404 is the expected outcome once the identity is gone. Anything else is unverified,
        // and an unverified check must never be reported as clean.
        if ((error as { status?: number }).status !== 404) {
          leftovers.push(`auth users/${who}: could not verify (${error.message})`);
        }
      } else if (data?.user) {
        leftovers.push(`auth users/${who}: still present`);
      }
    } catch (err) {
      leftovers.push(`auth users/${who}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return leftovers;
}

test.describe.configure({ mode: "serial" });

test.describe("SAN-1204 · the owning broker sees the real viewing request", () => {
  test.skip(
    !OPT_IN || !ORIGIN || !hasE2eEnv(),
    "Opt-in only: needs SAN1204_BROKER_E2E=1, PROD_SMOKE_BASE_URL and live Supabase env.",
  );

  test("owner sees it once at the right time; others cannot", async ({ browser }) => {
    const admin = await getSupabaseAdmin();
    const run = randomUUID().slice(0, 8);
    const fixture = await provisionFixture(admin, run);

    // The journey failure is captured rather than thrown from inside `finally`, because a
    // cleanup error thrown there would replace it and hide why the product actually failed.
    let journeyFailure: unknown;
    try {
      await seedRequest(admin, fixture, run);

      const owner = await assertOwnerSees(browser, fixture, run);
      const other = await assertOtherDenied(browser, fixture);
      const mobile = await assertMobileWorkspace(browser, fixture);
      await assertAnonymousDenied(browser);

      for (const [who, problems] of [
        ["owner", owner],
        ["unrelated broker", other],
        ["mobile", mobile],
      ] as const) {
        expect(problems.consoleErrors, `${who} console errors`).toEqual([]);
        expect(problems.failedRequests, `${who} failed requests`).toEqual([]);
      }
    } catch (err) {
      journeyFailure = err;
    }

    const cleanupFailures = await cleanupFixture(admin, fixture);
    const residue = await assertNoResidue(admin, fixture);

    if (journeyFailure) {
      // The journey error is what this test surfaces, so it must not swallow cleanup problems:
      // a failing journey that also stranded production rows would otherwise look like a plain
      // assertion failure. Report the residue loudly, then rethrow the real cause.
      if (cleanupFailures.length > 0) {
        console.error(
          `[san-1204] cleanup incomplete after a failing journey: ${cleanupFailures.join("; ")}`,
        );
      }
      if (residue.length > 0) {
        console.error(
          `[san-1204] PRODUCTION RESIDUE after a failing journey: ${residue.join("; ")}`,
        );
      }
      throw journeyFailure;
    }

    expect(cleanupFailures, "SAN-1204 cleanup must not leave production residue").toEqual([]);
    expect(residue, "SAN-1204 cleanup must be verified, not assumed").toEqual([]);
  });
});
