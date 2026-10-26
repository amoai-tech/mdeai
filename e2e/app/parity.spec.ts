import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import {
  createThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  signInAsOnOrigin,
} from "../helpers/auth";
import { createPartner, cleanupFixtures } from "../helpers/partner-fixtures";

type Admin = Awaited<ReturnType<typeof getSupabaseAdmin>>;
type Row = {
  id: string;
  legacyUrl: string;
  appUrl: string;
  actor: string;
  state: string;
};
const MANIFEST = JSON.parse(
  fs.readFileSync("e2e/app/parity-routes.json", "utf8"),
) as Row[];

type Fixture = {
  ana: Awaited<ReturnType<typeof createThrowawayIdentity>>;
  carlos: Awaited<ReturnType<typeof createThrowawayIdentity>>;
  adminUser: Awaited<ReturnType<typeof createThrowawayIdentity>>;
  partnerId: string;
  eventId: string;
  draftId: string;
  draftSlug: string;
  collectionId: string;
  ticketId: string;
  orderId: string;
};

test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
});
test.describe.configure({ timeout: 240_000 });
test.skip(!hasE2eEnv(), "Supabase e2e env is not configured");

async function seed(admin: Admin, run: string): Promise<Fixture> {
  const ana = await createThrowawayIdentity("san1581-ana");
  const carlos = await createThrowawayIdentity("san1581-carlos");
  const adminUser = await createThrowawayIdentity("san1581-admin");

  const landlord = await admin.from("landlord_profiles").insert({
    user_id: ana.userId,
    display_name: "SAN-1581 QA Broker",
  });
  if (landlord.error) throw new Error(landlord.error.message);

  const partnerId = await createPartner(admin, ana.userId, "venue", {
    businessName: "Café Parity",
    description: "SAN-1581 QA business",
  });

  const event = await admin.from("events").insert({
    source: "manual",
    name: `SAN-1581 QA Event ${run} (not a real event)`,
    slug: `qa-san1581-${run}`,
    description: "Synthetic SAN-1581 parity fixture.",
    city: "Medellín",
    country: "CO",
    currency: "COP",
    event_start_time: "2027-06-12T20:00:00-05:00",
    status: "published",
    organizer_id: ana.userId,
    is_active: true,
  }).select("id").single();
  if (event.error || !event.data) throw new Error(event.error?.message ?? "event");

  const draft = await admin.from("events").insert({
    source: "manual",
    name: `SAN-1581 QA Draft ${run} (not a real event)`,
    slug: `qa-san1581-draft-${run}`,
    description: "Synthetic SAN-1581 draft.",
    city: "Medellín",
    country: "CO",
    currency: "COP",
    event_start_time: "2027-06-12T20:00:00-05:00",
    status: "draft",
    organizer_id: ana.userId,
    is_active: true,
  }).select("id, slug").single();
  if (draft.error || !draft.data) throw new Error(draft.error?.message ?? "draft");

  const ticket = await admin.from("event_tickets").insert({
    event_id: event.data.id, name: "GA", price_cents: 50_000, qty_total: 40, qty_sold: 2, currency: "COP",
  }).select("id").single();
  if (ticket.error || !ticket.data) throw new Error(ticket.error?.message ?? "ticket");

  const order = await admin.from("event_orders").insert({
    event_id: event.data.id, ticket_id: ticket.data.id,
    buyer_email: `san1581-${run}@qa-isolation.mdeai.co`, buyer_name: "SAN-1581 QA Buyer",
    quantity: 2, total_cents: 10_000_000, currency: "COP",
    short_id: `SAN1581-${run}`, access_token: randomUUID().replaceAll("-", ""), status: "paid",
  }).select("id").single();
  if (order.error || !order.data) throw new Error(order.error?.message ?? "order");

  const collection = await admin.from("collections").insert({
    user_id: ana.userId,
    name: "SAN-1581 Saved",
    emoji: "🏠",
  }).select("id").single();
  if (collection.error || !collection.data) throw new Error(collection.error?.message ?? "collection");

  const role = await admin.from("user_roles").insert({
    user_id: adminUser.userId,
    role: "admin",
  });
  if (role.error) throw new Error(role.error.message);

  return {
    ana, carlos, adminUser, partnerId,
    eventId: event.data.id,
    draftId: draft.data.id,
    draftSlug: draft.data.slug ?? `qa-san1581-draft-${run}`,
    collectionId: collection.data.id,
    ticketId: ticket.data.id,
    orderId: order.data.id,
  };
}

async function destroy(admin: Admin, fixture: Fixture) {
  await admin.from("event_orders").delete().eq("id", fixture.orderId);
  await admin.from("event_tickets").delete().eq("id", fixture.ticketId);
  await admin.from("events").delete().in("id", [fixture.eventId, fixture.draftId]);
  await admin.from("partner_members").delete().eq("partner_id", fixture.partnerId);
  await admin.from("partners").delete().eq("id", fixture.partnerId);
  await admin.from("collections").delete().eq("id", fixture.collectionId);
  await admin.from("landlord_profiles").delete().eq("user_id", fixture.ana.userId);
  await admin.from("user_roles").delete().eq("user_id", fixture.adminUser.userId);
  await cleanupFixtures(admin, [fixture.partnerId], [fixture.ana, fixture.carlos, fixture.adminUser]);
  const left = await Promise.all([
    admin.from("events").select("id", { count: "exact", head: true }).in("organizer_id", [fixture.ana.userId, fixture.carlos.userId]),
    admin.from("partners").select("id", { count: "exact", head: true }).eq("id", fixture.partnerId),
    admin.from("collections").select("id", { count: "exact", head: true }).eq("user_id", fixture.ana.userId),
  ]);
  expect(left.map((r) => r.count)).toEqual([0, 0, 0]);
}

async function assertOneMain(page: Page) {
  await expect(page.locator("main")).toHaveCount(1);
}

test("guest app routes return to login with the exact next path", async ({ page }) => {
  for (const row of MANIFEST.filter((r) => !r.appUrl.includes(":"))) {
    await page.goto(row.appUrl, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get("next")).toBe(row.appUrl);
  }
});

test("Ana crosses all five workspaces once; legacy URLs preserve identity", async ({ page, baseURL }) => {
  const origin = baseURL ?? "http://localhost:3001";
  const admin = await getSupabaseAdmin();
  const fixture = await seed(admin, randomUUID().slice(0, 8));
  const copilot: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/copilotkit")) copilot.push(r.url()); });

  try {
    await signInAsOnOrigin(page, origin, fixture.ana.email);
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    for (const kind of ["personal", "rentals", "events", "partners"]) {
      await expect(page.getByTestId(`workspace-card-${kind}`)).toBeVisible();
    }
    await expect(page.getByTestId("workspace-card-team")).toHaveCount(0);
    expect(copilot).toHaveLength(0);

    await page.goto("/app/me/saved", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("SAN-1581 Saved")).toBeVisible();
    await assertOneMain(page);
    await page.goto("/app/me/tickets", { waitUntil: "domcontentloaded" });
    await assertOneMain(page);

    await page.goto("/app/rentals", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("rentals-concierge")).toBeVisible();
    await assertOneMain(page);
    await page.goto("/app/rentals/listings", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("rentals-listings")).toBeVisible();
    await assertOneMain(page);

    await page.goto("/app/events", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(`SAN-1581 QA Event`)).toBeVisible();
    await expect(page.getByText(`SAN-1581 QA Draft`)).toBeVisible();
    await expect(page.getByTestId("host-os-chat-region")).toHaveCount(1);
    await assertOneMain(page);
    await page.getByTestId("host-os-nav-overview").click();
    await expect(page).toHaveURL(/\/app\/events\/overview$/);
    await expect(page.getByTestId("host-kpi-card-revenue")).toBeVisible();
    await expect(page.getByTestId("host-os-chat-region")).toHaveCount(1);
    await page.getByTestId("host-os-nav-analytics").click();
    await expect(page).toHaveURL(/\/app\/events\/analytics$/);
    await expect(page.getByTestId("host-kpi-card-revenue")).toBeVisible();

    await page.goto("/app/partners/profile", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Café Parity" }),
    ).toBeVisible();
    await assertOneMain(page);
    await page.goto(`/app/partners/profile?partner=${fixture.partnerId}`, { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).searchParams.get("partner")).toBe(fixture.partnerId);
    await expect(page.getByRole("heading", { level: 1, name: "Café Parity" })).toBeVisible();

    for (const row of MANIFEST.filter((r) => r.actor === "ana" && !r.legacyUrl.includes(":"))) {
      await page.goto(row.legacyUrl, { waitUntil: "domcontentloaded" });
      expect(new URL(page.url()).pathname).toBe(row.legacyUrl.split("?")[0]);
      await expect(page.locator("body")).not.toContainText("This page could not be found");
    }
    await page.goto(`/partners/profile?partner=${fixture.partnerId}`, { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).searchParams.get("partner")).toBe(fixture.partnerId);
    await expect(page.getByRole("heading", { level: 1, name: "Café Parity" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: innerWidth }));
    expect(widths.page).toBeLessThanOrEqual(widths.screen);
    const minTarget = await page.evaluate(() =>
      Math.min(...[...document.querySelectorAll("header a, header button")].map((e) => Math.round(e.getBoundingClientRect().height))),
    );
    expect(minTarget).toBeGreaterThanOrEqual(44);
  } finally {
    await destroy(admin, fixture);
  }
});

test("Carlos cannot cross Ana's workspace boundary; admin contest gate is real", async ({ browser, baseURL }) => {
  const origin = baseURL ?? "http://localhost:3001";
  const admin = await getSupabaseAdmin();
  const fixture = await seed(admin, randomUUID().slice(0, 8));
  const anaContext = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 900 } });
  const carlosContext = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 900 } });
  try {
    const anaPage = await anaContext.newPage();
    const carlosPage = await carlosContext.newPage();
    await signInAsOnOrigin(anaPage, origin, fixture.ana.email);
    await signInAsOnOrigin(carlosPage, origin, fixture.carlos.email);

    await carlosPage.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(carlosPage.getByTestId("workspace-card-personal")).toBeVisible();
    await expect(carlosPage.getByTestId("workspace-card-events")).toBeVisible();
    await expect(carlosPage.getByTestId("workspace-card-rentals")).toHaveCount(0);
    await expect(carlosPage.getByTestId("workspace-card-partners")).toHaveCount(0);
    await expect(carlosPage.getByTestId("workspace-card-team")).toHaveCount(0);

    await carlosPage.goto(`/app/partners/profile?partner=${fixture.partnerId}`, { waitUntil: "domcontentloaded" });
    await expect(carlosPage.getByTestId("partner-profile-missing")).toBeVisible();
    await expect(carlosPage.getByText("Café Parity")).toHaveCount(0);
    await carlosPage.goto(`/events/${fixture.draftSlug}`, { waitUntil: "domcontentloaded" });
    await expect(carlosPage.getByRole("heading", { name: "Event not found" })).toBeVisible();
    await carlosPage.goto("/app/contests", { waitUntil: "domcontentloaded" });
    await expect(carlosPage.getByTestId("app-not-authorized")).toBeVisible();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const { createClient } = await import("@supabase/supabase-js");
    const session = await getTestSession(fixture.carlos.email);
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });
    const partner = await client.from("partners").select("id").eq("id", fixture.partnerId);
    const draft = await client.from("events").select("id").eq("id", fixture.draftId);
    expect(partner.data ?? []).toEqual([]);
    expect(draft.data ?? []).toEqual([]);

    const adminContext = await browser.newContext({ baseURL: origin });
    const adminPage = await adminContext.newPage();
    await signInAsOnOrigin(adminPage, origin, fixture.adminUser.email);
    await adminPage.goto("/app/contests", { waitUntil: "domcontentloaded" });
    await expect(adminPage.getByTestId("app-contests-page")).toBeVisible();
    await expect(adminPage.getByTestId("app-not-authorized")).toHaveCount(0);
    await adminContext.close();
  } finally {
    await anaContext.close();
    await carlosContext.close();
    await destroy(admin, fixture);
  }
});
