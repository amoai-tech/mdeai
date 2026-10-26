import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  loadEnvLocalForE2E,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "../helpers/auth";

test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
});

/**
 * SAN-1577 — the real /app Events workspace.
 *
 * Two disposable organizers, real `events`/`event_tickets`/`event_orders` rows,
 * the real sign-in cookie path, and the existing Host OS loaders. The fixture
 * cleanup deletes every row it wrote and re-queries to prove zero residue.
 */

type Admin = Awaited<ReturnType<typeof getSupabaseAdmin>>;
type SeededEvent = { id: string; slug: string; name: string; status: string };

const EVIDENCE_DIR = "tmp/qa/san-1577";

function ensureEvidenceDir(): void {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

/**
 * Next's dev-mode issue badge is fixed-position chrome, not product UI. It is
 * hidden only for evidence screenshots; the underlying CopilotChat hydration
 * warning is logged in the PR as a pre-existing dev warning.
 */
async function hideNextDevBadge(page: Page): Promise<void> {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function seedEvent(
  admin: Admin,
  organizerId: string,
  run: string,
  status: "draft" | "published",
): Promise<SeededEvent> {
  const label = status === "published" ? "Live" : "Draft";
  const owner = organizerId.slice(0, 8);
  const name = `SAN-1577 QA ${label} event ${run} ${owner} (not a real event)`;
  const slug = `qa-san1577-${status}-${run}-${owner}`;

  const { data, error } = await admin
    .from("events")
    .insert({
      source: "manual",
      name,
      slug,
      description: "Synthetic SAN-1577 development fixture. Not a real event.",
      city: "Medellín",
      country: "CO",
      currency: "COP",
      event_start_time: "2027-06-12T20:00:00-05:00",
      status,
      organizer_id: organizerId,
      is_active: true,
    })
    .select("id, slug")
    .single();

  if (error || !data) {
    throw new Error(`event insert failed: ${error?.message ?? "no row"}`);
  }
  return { id: data.id as string, slug: data.slug as string, name, status };
}

async function seedPaidTicket(admin: Admin, event: SeededEvent, run: string): Promise<void> {
  const { data: ticket, error: ticketError } = await admin
    .from("event_tickets")
    .insert({
      event_id: event.id,
      name: "GA",
      price_cents: 90_000,
      qty_total: 10,
      qty_sold: 2,
      currency: "COP",
    })
    .select("id")
    .single();
  if (ticketError || !ticket) {
    throw new Error(`ticket insert failed: ${ticketError?.message ?? "no row"}`);
  }

  const { error: orderError } = await admin.from("event_orders").insert({
    event_id: event.id,
    ticket_id: ticket.id,
    buyer_email: `san1577-${run}@qa-isolation.mdeai.co`,
    buyer_name: "SAN-1577 QA Buyer",
    quantity: 2,
    total_cents: 180_000,
    currency: "COP",
    short_id: `SAN1577-${run}`,
    access_token: randomUUID().replaceAll("-", ""), // nosemgrep -- generated per run, not a credential
    status: "paid",
  });
  expect(orderError, orderError?.message).toBeNull();
}

async function cleanupOrganizer(
  admin: Admin,
  identity: ThrowawayIdentity,
): Promise<string[]> {
  const failures: string[] = [];
  const { data: events, error } = await admin
    .from("events")
    .select("id")
    .eq("organizer_id", identity.userId);
  if (error) failures.push(`select events: ${error.message}`);
  const eventIds = (events ?? []).map((row) => row.id as string);

  if (eventIds.length > 0) {
    const orders = await admin.from("event_orders").delete().in("event_id", eventIds);
    if (orders.error) failures.push(`delete event_orders: ${orders.error.message}`);
    const tickets = await admin.from("event_tickets").delete().in("event_id", eventIds);
    if (tickets.error) failures.push(`delete event_tickets: ${tickets.error.message}`);
    const deleted = await admin.from("events").delete().in("id", eventIds);
    if (deleted.error) failures.push(`delete events: ${deleted.error.message}`);

    // Independent re-query: an unknown count is never zero.
    const leftoverEvents = await admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .in("id", eventIds);
    if (leftoverEvents.error) failures.push(`verify events: ${leftoverEvents.error.message}`);
    if ((leftoverEvents.count ?? 0) !== 0) {
      failures.push(`event cleanup left ${leftoverEvents.count} rows`);
    }
    const leftoverOrders = await admin
      .from("event_orders")
      .select("id", { count: "exact", head: true })
      .in("event_id", eventIds);
    if (leftoverOrders.error) failures.push(`verify event_orders: ${leftoverOrders.error.message}`);
    if ((leftoverOrders.count ?? 0) !== 0) {
      failures.push(`order cleanup left ${leftoverOrders.count} rows`);
    }
    const leftoverTickets = await admin
      .from("event_tickets")
      .select("id", { count: "exact", head: true })
      .in("event_id", eventIds);
    if (leftoverTickets.error) failures.push(`verify event_tickets: ${leftoverTickets.error.message}`);
    if ((leftoverTickets.count ?? 0) !== 0) {
      failures.push(`ticket cleanup left ${leftoverTickets.count} rows`);
    }
  }

  const byOrganizer = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", identity.userId);
  if (byOrganizer.error) failures.push(`verify organizer events: ${byOrganizer.error.message}`);
  if ((byOrganizer.count ?? 0) !== 0) {
    failures.push(`organizer ${identity.userId} still has ${byOrganizer.count} events`);
  }

  return failures;
}

async function eventCardIds(page: Page): Promise<(string | null)[]> {
  return page.getByTestId("host-event-card").evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-event-id")),
  );
}

async function assertOneMainAndNoOverflow(page: Page, label: string): Promise<void> {
  await expect(page.locator("main"), `${label}: AppShell must own the only main`).toHaveCount(1);
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    screen: window.innerWidth,
  }));
  expect(
    widths.page,
    `${label}: no horizontal scrolling (${widths.page} > ${widths.screen})`,
  ).toBeLessThanOrEqual(widths.screen);
}

async function assertWorkspaceChrome(page: Page, label: string): Promise<void> {
  await expect(page.getByTestId("host-os-nav"), `${label}: one workspace nav`).toHaveCount(1);
  await expect(
    page.getByTestId("host-os-chat-region"),
    `${label}: one persistent Host OS conversation`,
  ).toHaveCount(1);
}

async function signInAtWorkspace(page: Page, origin: string, email: string): Promise<void> {
  await signInAsOnOrigin(page, origin, email);
  await page.goto("/app", { waitUntil: "domcontentloaded" });
}

// A separate browser context lets the negative test sign in as B without
// inheriting any of A's page state.
async function newSignedInPage(browser: Browser, origin: string, email: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await signInAsOnOrigin(page, origin, email);
  return page;
}

// Named helper: keeps each Playwright test under the complexity limit.
async function runOrganizerJourney(
  page: Page,
  browser: Browser,
  baseURL: string | undefined,
) {
  ensureEvidenceDir();
  const origin = baseURL ?? "http://localhost:3001";
  const admin = await getSupabaseAdmin();
  const roberto = await createThrowawayIdentity("san1577-roberto");
  const sofia = await createThrowawayIdentity("san1577-sofia");
  const run = randomUUID().slice(0, 8);

  let robertoLive: SeededEvent | null = null;
  let robertoDraft: SeededEvent | null = null;
  let sofiaDraft: SeededEvent | null = null;
  let sofiaPage: Page | null = null;
  let tracing = false;

  try {
    robertoLive = await seedEvent(admin, roberto.userId, run, "published");
    robertoDraft = await seedEvent(admin, roberto.userId, run, "draft");
    sofiaDraft = await seedEvent(admin, sofia.userId, run, "draft");
    await seedPaidTicket(admin, robertoLive, run);

    // ── Desktop 1440: /app → Events ───────────────────────────────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
      name: "san-1577-organizer",
    });
    tracing = true;

    await signInAtWorkspace(page, origin, roberto.email);
    const eventsCard = page.getByTestId("workspace-card-events");
    await expect(eventsCard).toBeVisible();
    await expect(eventsCard.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/app/events",
    );

    await eventsCard.getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/app\/events$/, { timeout: 60_000 });
    await expect(page.getByTestId("host-events")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(robertoLive.name)).toBeVisible();
    await expect(page.getByText(robertoDraft.name)).toBeVisible();
    await expect(page.getByText(sofiaDraft.name)).toHaveCount(0);
    await expect(page.getByTestId("host-event-card")).toHaveCount(2);
    const appEventIds = await eventCardIds(page);
    expect(appEventIds).toHaveLength(2);
    expect(appEventIds.every(Boolean)).toBe(true);
    await assertOneMainAndNoOverflow(page, "desktop events");
    await assertWorkspaceChrome(page, "desktop events");
    await expect(page.getByText("My events")).toBeVisible();
    await expect(page.getByTestId("workspace-switcher")).toHaveAttribute(
      "aria-label",
      "Switch workspace. Current: Events",
    );

    // The layout did not remount: the exact chat node survives navigation.
    const chat = page.getByTestId("host-os-chat-region");
    await chat.evaluate((element) => {
      element.setAttribute("data-qa-same-workspace", "yes");
    });
    await hideNextDevBadge(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-events-1440.png"),
      fullPage: true,
    });

    // ── Overview: real paid-order KPIs from the existing loader ─────────────
    await page.getByTestId("host-os-nav-overview").click();
    await expect(page).toHaveURL(/\/app\/events\/overview$/, { timeout: 60_000 });
    await expect(page.getByTestId("host-dashboard")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("host-kpi-card-revenue")).toContainText("1,800");
    await expect(page.getByTestId("host-kpi-card-tickets")).toContainText("2");
    await expect(page.getByTestId("host-kpi-card-orders")).toContainText("1");
    const appRevenue = await page.getByTestId("host-kpi-card-revenue").innerText();
    await expect(page.getByTestId("host-os-chat-region")).toHaveAttribute(
      "data-qa-same-workspace",
      "yes",
    );
    await assertOneMainAndNoOverflow(page, "desktop overview");
    await assertWorkspaceChrome(page, "desktop overview");
    await hideNextDevBadge(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-overview-1440.png"),
      fullPage: true,
    });

    // ── Analytics: same loaders/tables, no second sales service ─────────────
    await page.getByTestId("host-os-nav-analytics").click();
    await expect(page).toHaveURL(/\/app\/events\/analytics$/, { timeout: 60_000 });
    await expect(page.getByTestId("host-analytics")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("host-kpi-card-revenue")).toContainText("1,800");
    await expect(page.getByTestId("host-os-chat-region")).toHaveAttribute(
      "data-qa-same-workspace",
      "yes",
    );
    await assertOneMainAndNoOverflow(page, "desktop analytics");
    await assertWorkspaceChrome(page, "desktop analytics");
    await hideNextDevBadge(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-analytics-1440.png"),
      fullPage: true,
    });

    // ── Back to Events and the real wizard body ─────────────────────────────
    await page.getByTestId("host-os-nav-events").click();
    await expect(page).toHaveURL(/\/app\/events$/, { timeout: 60_000 });
    await expect(page.getByText(robertoLive.name)).toBeVisible();
    await page.getByTestId("host-events-new").click();
    await expect(page).toHaveURL(/\/app\/events\/new$/, { timeout: 60_000 });
    await expect(page.getByTestId("host-event-wizard")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("host-event-form")).toBeVisible();
    // Embedded wizard: AppShell header only, no legacy host nav rail.
    await expect(page.getByTestId("host-nav-rail")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "← My events" })).toHaveAttribute(
      "href",
      "/app/events",
    );
    await assertOneMainAndNoOverflow(page, "desktop wizard");
    await hideNextDevBadge(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-wizard-1440.png"),
      fullPage: true,
    });

    // Back + refresh both resolve to the real persisted list.
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/events$/, { timeout: 60_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(robertoLive.name)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(robertoDraft.name)).toBeVisible();
    await assertOneMainAndNoOverflow(page, "desktop refresh");
    await assertWorkspaceChrome(page, "desktop refresh");

    // ── Legacy /host URLs still render the same organizer data ──────────────
    await page.goto("/host/events", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("host-events")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(robertoLive.name)).toBeVisible();
    await expect(page.getByText(robertoDraft.name)).toBeVisible();
    await expect(page.getByText(sofiaDraft.name)).toHaveCount(0);
    expect(await eventCardIds(page), "legacy and /app must show identical event IDs/order")
      .toEqual(appEventIds);
    await expect(page.locator("main")).toHaveCount(1);
    // Legacy /host/events still uses the original Host OS shell/nav.
    await expect(page.getByTestId("host-os-shell")).toHaveCount(1);

    // Legacy Overview and Analytics must keep working with the same data.
    await page.goto("/host/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("host-dashboard")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("host-kpi-card-revenue")).toContainText("1,800");
    expect(await page.getByTestId("host-kpi-card-revenue").innerText())
      .toBe(appRevenue);
    await expect(page.getByTestId("host-os-shell")).toHaveCount(1);

    await page.goto("/host/analytics", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("host-analytics")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("host-kpi-card-revenue")).toContainText("1,800");
    await expect(page.getByTestId("host-os-shell")).toHaveCount(1);

    // ── Organizer B: signed-in, own workspace, no access to A's private row ─
    sofiaPage = await newSignedInPage(browser, origin, sofia.email);
    await sofiaPage.goto("/app/events", { waitUntil: "domcontentloaded" });
    await expect(sofiaPage.getByTestId("host-events")).toBeVisible({ timeout: 60_000 });
    await expect(sofiaPage.getByText(sofiaDraft.name)).toBeVisible();
    await expect(sofiaPage.getByText(robertoLive.name)).toHaveCount(0);
    await expect(sofiaPage.getByText(robertoDraft.name)).toHaveCount(0);
    await assertOneMainAndNoOverflow(sofiaPage, "organizer B events");

    // A direct URL to A's private draft shows the public not-found view for B
    // (the response is streamed, so assert the rendered outcome, not a 404 code).
    await sofiaPage.goto(`/events/${robertoDraft.slug}`);
    await expect(
      sofiaPage.getByRole("heading", { name: "Event not found" }),
      "organizer B must not open A's draft event",
    ).toBeVisible();
    await expect(sofiaPage.getByText(robertoDraft.name)).toHaveCount(0);

    // Direct data API with B's real session cannot read A's draft either.
    loadEnvLocalForE2E();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "";
    expect(supabaseUrl).not.toBe("");
    expect(anonKey).not.toBe("");
    const sofiaSession = await getTestSession(sofia.email);
    const { createClient } = await import("@supabase/supabase-js");
    const sofiaClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${sofiaSession.access_token}` },
      },
    });
    const directRead = await sofiaClient
      .from("events")
      .select("id, name")
      .eq("id", robertoDraft.id);
    expect(directRead.error, directRead.error?.message).toBeNull();
    expect(directRead.data ?? [], "RLS must hide A's private event from B").toEqual([]);

    // ── 390px: Events, Overview, Analytics and the wizard ───────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/events", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(robertoLive.name)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(robertoDraft.name)).toBeVisible();
    await assertOneMainAndNoOverflow(page, "mobile events");
    await assertWorkspaceChrome(page, "mobile events");
    await expect(
      page.getByTestId("copilot-chat-textarea"),
      "the one host conversation must stay usable on a phone",
    ).toBeVisible();
    await hideNextDevBadge(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-events-390.png"),
      fullPage: true,
    });

    await page.getByTestId("host-os-nav-overview").click();
    await expect(page).toHaveURL(/\/app\/events\/overview$/, { timeout: 60_000 });
    await expect(page.getByTestId("host-kpi-card-revenue")).toContainText("1,800");
    await assertOneMainAndNoOverflow(page, "mobile overview");
    await hideNextDevBadge(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-overview-390.png"),
      fullPage: true,
    });

    await page.getByTestId("host-os-nav-analytics").click();
    await expect(page).toHaveURL(/\/app\/events\/analytics$/, { timeout: 60_000 });
    await expect(page.getByTestId("host-analytics")).toBeVisible();
    await assertOneMainAndNoOverflow(page, "mobile analytics");
    await hideNextDevBadge(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-analytics-390.png"),
      fullPage: true,
    });

    await page.getByTestId("host-os-nav-events").click();
    await expect(page).toHaveURL(/\/app\/events$/, { timeout: 60_000 });
    await page.getByTestId("host-events-new").click();
    await expect(page).toHaveURL(/\/app\/events\/new$/, { timeout: 60_000 });
    await expect(page.getByTestId("host-event-wizard")).toBeVisible({ timeout: 60_000 });
    await assertOneMainAndNoOverflow(page, "mobile wizard");
    await hideNextDevBadge(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-wizard-390.png"),
      fullPage: true,
    });

    // The signed-in B context is independent; close it here so its trace/log
    // cannot be confused with A's evidence.
    await sofiaPage.context().close();
    sofiaPage = null;

    await page.context().tracing.stop({
      path: path.join(EVIDENCE_DIR, "san-1577-trace.zip"),
    });
    tracing = false;
  } finally {
    if (sofiaPage) await sofiaPage.context().close().catch(() => undefined);
    if (tracing) {
      await page.context().tracing
        .stop({ path: path.join(EVIDENCE_DIR, "san-1577-trace-failed.zip") })
        .catch(() => undefined);
    }

    const cleanupErrors: string[] = [];
    for (const identity of [roberto, sofia]) {
      cleanupErrors.push(...(await cleanupOrganizer(admin, identity)));
      try {
        await deleteThrowawayIdentity(identity);
      } catch (error) {
        cleanupErrors.push(String(error));
      }
    }

    // Final independent proof after identity deletion.
    const [leftoverEvents, leftoverProfiles] = await Promise.all([
      admin
        .from("events")
        .select("id", { count: "exact", head: true })
        .in("organizer_id", [roberto.userId, sofia.userId]),
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("id", [roberto.userId, sofia.userId]),
    ]);
    if (leftoverEvents.error) cleanupErrors.push(leftoverEvents.error.message);
    if ((leftoverEvents.count ?? 0) !== 0) {
      cleanupErrors.push(`final event cleanup left ${leftoverEvents.count} rows`);
    }
    if (leftoverProfiles.error) cleanupErrors.push(leftoverProfiles.error.message);
    if ((leftoverProfiles.count ?? 0) !== 0) {
      cleanupErrors.push(`final profile cleanup left ${leftoverProfiles.count} rows`);
    }

    expect(cleanupErrors, "temporary QA rows and identities must be completely deleted").toEqual([]);
  }
}

test.describe("SAN-1577 /app events workspace", { tag: ["@app", "@events"] }, () => {
  test.setTimeout(240_000);
  test.skip(!hasE2eEnv(), "Supabase e2e env is not configured");

  test("guest is returned to login with the exact Events path", async ({ page }) => {
    await page.goto("/app/events", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fevents$/);
    await expect(page.getByTestId("host-events")).toHaveCount(0);
    await expect(page.getByTestId("host-os-workspace")).toHaveCount(0);
  });

  test("organizer runs Events, Overview, Analytics, the wizard, refresh and mobile", async ({
    page,
    browser,
    baseURL,
  }) => {
    await runOrganizerJourney(page, browser, baseURL);
  });
});
