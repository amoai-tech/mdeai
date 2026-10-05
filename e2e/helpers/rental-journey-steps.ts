import { randomUUID } from "node:crypto";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { establishVercelAutomationBypass, validateVercelCandidateOrigin } from "../fixtures/vercel-bypass";
import { getTestSession, signInAsOnOrigin } from "./auth";
import {
  asUser,
  countRequestRows,
  renterEmail,
  type Admin,
  type Fixture,
  type ScheduleBody,
} from "./rental-journey-fixture";

/**
 * SAN-1205 · the browser and assertion steps of the rental-conversion journey.
 *
 * Each step does one thing and fails with a message that names what was wrong. A control is
 * clicked once, after React has attached its handler; a dropped click fails the step.
 */

export const OPT_IN = process.env.SAN1205_JOURNEY_E2E === "1";
export const ORIGIN = (process.env.PROD_SMOKE_BASE_URL ?? "").trim().replace(/\/$/, "");
export const CANDIDATE_SHA = process.env.SAN1205_CANDIDATE_SHA?.trim() ?? "";

export const MOBILE_VIEWPORT = { width: 390, height: 844 };

export const route = (p: string) => new URL(p, `${ORIGIN}/`).toString();

/** A Medellín-local `datetime-local` value a few days out, on a whole hour. */
export function futureLocalSlot(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

/** Only a real MDE Vercel preview needs the automation bypass; production does not. */
export async function openCandidate(page: Page): Promise<void> {
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
export async function waitUntilInteractive(control: Locator, label: string): Promise<void> {
  await expect(control, `${label} must render`).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(
      () =>
        control.evaluate((el) =>
          Object.entries(el).some(
            ([key, value]) =>
              key.startsWith("__reactProps$") &&
              typeof (value as { onClick?: unknown } | null)?.onClick === "function",
          ),
        ),
      { timeout: 60_000, message: `${label} never became interactive (React did not hydrate)` },
    )
    .toBe(true);
}

/** Open the request form on a listing page. One click; the form must appear. */
export async function openRequestForm(page: Page, apartmentId: string): Promise<void> {
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

export async function fillRequestForm(
  page: Page,
  renter: { name: string; email: string; phone: string },
  preferredAt: string,
): Promise<void> {
  await page.locator('input[name="name"]').fill(renter.name);
  await page.locator('input[name="email"]').fill(renter.email);
  await page.locator('input[name="phone"]').fill(renter.phone);
  await page.locator('input[name="preferredAt"]').fill(preferredAt);
}

export async function submitRequest(page: Page): Promise<{ status: number; body: ScheduleBody }> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/leads/schedule-viewing") && r.request().method() === "POST",
      { timeout: 90_000 },
    ),
    page.locator('[data-testid="schedule-viewing-submit"]').click(),
  ]);
  return { status: response.status(), body: (await response.json()) as ScheduleBody };
}

export async function openBrokerWorkspace(browser: Browser, email: string, viewport?: typeof MOBILE_VIEWPORT) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  // Sign-in clears the cookie jar, so the preview handshake has to happen after it.
  await signInAsOnOrigin(page, ORIGIN, email);
  await openCandidate(page);
  await page.goto(route("/host/rentals"), { waitUntil: "domcontentloaded" });
  return { context, page };
}

// ── journey steps ──────────────────────────────────────────────────────────────

export type JourneyCtx = { browser: Browser; admin: Admin; fixture: Fixture; run: string };
export type Renter = { name: string; email: string; phone: string };
export type Committed = { leadId: string; showingId: string };

const SCHEDULE_API = "/api/leads/schedule-viewing";
const DETAIL_API = (apartmentId: string) => `/api/host/rentals/listings/${apartmentId}/detail`;

/** The body the renter's form sends, so a replay is byte-for-byte the same request. */
function requestBody(ctx: JourneyCtx, renter: Renter, slot: string) {
  return {
    listingId: ctx.fixture.apartmentId,
    listingTitle: ctx.fixture.title,
    neighborhood: "Laureles",
    name: renter.name,
    email: renter.email,
    phone: renter.phone,
    preferredAt: slot,
  };
}

/** 1 · a renter requests a viewing through the real form. */
export async function requestViewingThroughForm(
  ctx: JourneyCtx,
  page: Page,
  renter: Renter,
  slot: string,
): Promise<Committed> {
  await openRequestForm(page, ctx.fixture.apartmentId);
  await fillRequestForm(page, renter, slot);
  const first = await submitRequest(page);

  expect(first.status, `request failed: ${JSON.stringify(first.body)}`).toBe(200);
  expect(first.body.success).toBe(true);
  expect(first.body.leadId, "a committed lead id is required").toBeTruthy();
  expect(first.body.showingId, "a committed showing id is required").toBeTruthy();
  // The confirmation card only exists inside the chat shell, so on the listing page the
  // visible signal is that the form closed without an error. A visible "request sent"
  // message on this page is a separate product gap; this test must not pretend it exists.
  await expect(
    page.locator('[data-testid="schedule-viewing-modal"]'),
    "the form must close after a committed request",
  ).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('[data-testid="schedule-viewing-error"]')).toHaveCount(0);
  return { leadId: first.body.leadId as string, showingId: first.body.showingId as string };
}

/** 2 · exactly one lead and one showing, tied to this listing. */
export async function expectOneLeadOneShowing(ctx: JourneyCtx, renter: Renter, committed: Committed) {
  const { admin, fixture } = ctx;
  const { data: leads, error: leadsError } = await admin
    .from("leads")
    .select("id, apartment_id, email, status")
    .eq("apartment_id", fixture.apartmentId);
  expect(leadsError, "the lead query itself must succeed").toBeNull();
  expect(leads, "exactly one lead for this listing").toHaveLength(1);
  expect(leads![0].id).toBe(committed.leadId);
  expect(leads![0].email).toBe(renter.email);

  const { data: showings, error: showingsError } = await admin
    .from("showings")
    .select("id, lead_id, apartment_id, status")
    .eq("apartment_id", fixture.apartmentId);
  expect(showingsError, "the showing query itself must succeed").toBeNull();
  expect(showings, "exactly one showing for this listing").toHaveLength(1);
  expect(showings![0].id).toBe(committed.showingId);
  expect(showings![0].lead_id).toBe(committed.leadId);
}

/** 3 · replaying the identical request creates nothing new. */
export async function expectReplayCreatesNothing(
  ctx: JourneyCtx,
  page: Page,
  renter: Renter,
  slot: string,
  committed: Committed,
) {
  const replay = await page.request.post(route(SCHEDULE_API), { data: requestBody(ctx, renter, slot) });
  const body = (await replay.json()) as ScheduleBody;
  expect(replay.status(), `replay failed: ${JSON.stringify(body)}`).toBe(200);
  expect(body.leadId, "a replay must return the same lead").toBe(committed.leadId);
  expect(body.showingId, "a replay must return the same showing").toBe(committed.showingId);
  expect(await countRequestRows(ctx.admin, ctx.fixture)).toEqual({ leads: 1, showings: 1 });
}

/** 4a · bad requests, and a request for a listing that does not exist, write nothing. */
export async function expectRefusedRequestsWriteNothing(
  ctx: JourneyCtx,
  page: Page,
  renter: Renter,
  slot: string,
) {
  const before = await countRequestRows(ctx.admin, ctx.fixture);
  const valid = requestBody(ctx, renter, slot);
  const badRequests = [
    { why: "time in the past", data: { ...valid, email: renterEmail(ctx.run, "past"), preferredAt: "2020-01-01T10:00" } },
    { why: "invalid email", data: { ...valid, email: "not-an-email" } },
    { why: "missing time", data: { ...valid, email: renterEmail(ctx.run, "notime"), preferredAt: undefined } },
  ];
  for (const bad of badRequests) {
    const res = await page.request.post(route(SCHEDULE_API), { data: bad.data });
    const body = (await res.json()) as ScheduleBody;
    expect(res.status(), `${bad.why} must be refused`).toBe(400);
    expect(body.success, `${bad.why} must not succeed`).toBe(false);
    expect(body.error?.code, `${bad.why} must be a validation error`).toBe("VALIDATION_ERROR");
  }

  // A listing that does not exist must not produce a lead for it.
  const ghost = await page.request.post(route(SCHEDULE_API), {
    data: { ...valid, listingId: randomUUID(), email: renterEmail(ctx.run, "ghost") },
  });
  const ghostBody = (await ghost.json()) as ScheduleBody;
  expect(ghostBody.success, "a request for a missing listing must not succeed").not.toBe(true);
  expect(ghostBody.showingId, "no showing may exist for a missing listing").toBeUndefined();

  expect(await countRequestRows(ctx.admin, ctx.fixture), "refused requests must write no rows").toEqual(before);
}

/** 4b · when the server cannot save, the form says so, keeps the typed values, and never claims success. */
export async function expectUnsavedRequestIsHonest(
  ctx: JourneyCtx,
  page: Page,
  renter: Renter,
  slot: string,
) {
  await page.route(`**${SCHEDULE_API}`, (r) =>
    r.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "SHOWING_NOT_COMMITTED", message: "The viewing was not committed — please try again." },
      }),
    }),
  );
  const retryEmail = renterEmail(ctx.run, "uifail");
  await openRequestForm(page, ctx.fixture.apartmentId);
  await fillRequestForm(page, { ...renter, email: retryEmail }, slot);
  const failed = await submitRequest(page);
  expect(failed.status).toBe(502);
  await expect(page.locator('[data-testid="schedule-viewing-error"]')).toBeVisible();
  await expect(
    page.locator('[data-testid="schedule-viewing-modal"]'),
    "the form must stay open after a failure",
  ).toBeVisible();
  await expect(page.locator('input[name="email"]')).toHaveValue(retryEmail);
  await expect(
    page.getByText(/viewing request(ed| received)/i),
    "a request that was not saved must never say it was",
  ).toHaveCount(0);
  await expect(page.locator('[data-testid="lead-confirmation-card"]')).toHaveCount(0);
  await page.unroute(`**${SCHEDULE_API}`);
}

/** 5a · the owning broker sees the exact request on screen, once, and after a refresh. */
async function expectOwnerSeesOnScreen(ctx: JourneyCtx, page: Page, committed: Committed) {
  const card = page.locator(`[data-showing-id="${committed.showingId}"]`);
  await expect(card, "owning broker must see the exact showing").toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator(`[data-lead-id="${committed.leadId}"]`)).toHaveCount(1);
  await expect(card).toHaveAttribute("data-apartment-id", ctx.fixture.apartmentId);
  await expect(card).toContainText(ctx.fixture.title);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.locator(`[data-showing-id="${committed.showingId}"]`),
    "the request must survive a refresh without duplicating",
  ).toHaveCount(1, { timeout: 60_000 });
}

/** 5b · the owning broker reads exactly the one lead and showing at the database and the API. */
async function expectOwnerReadsRows(ctx: JourneyCtx, page: Page, committed: Committed) {
  const db = asUser(await getTestSession(ctx.fixture.owner.email));
  const leads = await db.from("leads").select("id").eq("apartment_id", ctx.fixture.apartmentId);
  const showings = await db.from("showings").select("id").eq("apartment_id", ctx.fixture.apartmentId);
  expect(leads.error, "the owner's lead query must succeed").toBeNull();
  expect(showings.error, "the owner's showing query must succeed").toBeNull();
  expect(leads.data, "owner reads exactly the one lead").toHaveLength(1);
  expect(showings.data, "owner reads exactly the one showing").toHaveLength(1);

  const api = await page.request.get(route(DETAIL_API(ctx.fixture.apartmentId)));
  expect(api.status(), "the owning broker is allowed").toBe(200);
  const apiBody = (await api.json()) as { leads: Array<{ id: string }>; showings: Array<{ id: string }> };
  expect(apiBody.leads.map((l) => l.id)).toEqual([committed.leadId]);
  expect(apiBody.showings.map((s) => s.id)).toEqual([committed.showingId]);
}

/** 5 · the owning broker receives the request: screen, refresh, database and API. */
export async function expectOwnerReceivesRequest(ctx: JourneyCtx, committed: Committed) {
  const owner = await openBrokerWorkspace(ctx.browser, ctx.fixture.owner.email);
  await expectOwnerSeesOnScreen(ctx, owner.page, committed);
  await expectOwnerReadsRows(ctx, owner.page, committed);
  await owner.context.close();
}

/** 5c · phone width: the same request is reachable behind the Workspace tab. */
export async function expectOwnerSeesRequestOnPhone(ctx: JourneyCtx, committed: Committed) {
  const mobile = await openBrokerWorkspace(ctx.browser, ctx.fixture.owner.email, MOBILE_VIEWPORT);
  const workspaceTab = mobile.page.getByRole("button", { name: "Workspace" });
  await waitUntilInteractive(workspaceTab, "the Workspace tab");
  await workspaceTab.click();
  await expect(
    mobile.page.locator(`[data-showing-id="${committed.showingId}"]`),
    "owning broker must see the request on a phone",
  ).toHaveCount(1, { timeout: 30_000 });
  await mobile.context.close();
}

/** 6 · an unrelated broker is denied at the database, the API and the screen. */
export async function expectOtherBrokerDenied(ctx: JourneyCtx, committed: Committed) {
  const other = await openBrokerWorkspace(ctx.browser, ctx.fixture.other.email);
  const db = asUser(await getTestSession(ctx.fixture.other.email));
  const leads = await db.from("leads").select("id").eq("apartment_id", ctx.fixture.apartmentId);
  const showings = await db.from("showings").select("id").eq("apartment_id", ctx.fixture.apartmentId);
  // A failed query also returns no rows, so prove the query worked before trusting "zero".
  expect(leads.error, "the other broker's lead query must succeed, not fail").toBeNull();
  expect(showings.error, "the other broker's showing query must succeed, not fail").toBeNull();
  expect(leads.data, "RLS must hide the lead from another broker").toEqual([]);
  expect(showings.data, "RLS must hide the showing from another broker").toEqual([]);

  const api = await other.page.request.get(route(DETAIL_API(ctx.fixture.apartmentId)));
  expect(api.status(), "the API must refuse a non-owning broker").toBe(403);

  await expect(
    other.page.locator('[data-testid="rc-right"]'),
    "the unrelated broker still gets a workspace",
  ).toHaveCount(1, { timeout: 60_000 });
  await expect(
    other.page.locator(`[data-showing-id="${committed.showingId}"]`),
    "the screen must not show another broker's showing",
  ).toHaveCount(0);
  await expect(
    other.page.locator(`[data-lead-id="${committed.leadId}"]`),
    "the screen must not show another broker's lead",
  ).toHaveCount(0);
  await other.context.close();
}
