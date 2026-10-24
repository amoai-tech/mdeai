import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
} from "../helpers/auth";

test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
});

type Admin = Awaited<ReturnType<typeof getSupabaseAdmin>>;
type Buyer = { userId: string; email: string };

type Fixture = {
  eventName: string;
  eventId: string;
  ticketId: string;
  orderId: string;
  collectionId: string;
};

/**
 * Real rows for one synthetic buyer. Every value is generated per run; no
 * credential or token is hardcoded. The finally block deletes all of it.
 */
async function seedFixture(
  admin: Admin,
  buyer: Buyer,
  run: string,
): Promise<Fixture> {
  const eventName = `SAN-1576 QA EVENT ${run} (not a real event)`;

  const event = await admin
    .from("events")
    .insert({
      name: eventName,
      event_start_time: "2027-06-12T20:00:00-05:00",
      status: "published",
    })
    .select("id")
    .single();
  if (event.error || !event.data) {
    throw new Error(`event insert failed: ${event.error?.message ?? "no row"}`);
  }

  const ticket = await admin
    .from("event_tickets")
    .insert({
      event_id: event.data.id,
      name: "QA admission",
      price_cents: 90_000,
      qty_total: 10,
    })
    .select("id")
    .single();
  if (ticket.error || !ticket.data) {
    throw new Error(`ticket insert failed: ${ticket.error?.message ?? "no row"}`);
  }

  const fixtureAccessToken = randomUUID().replaceAll("-", "");
  const order = await admin
    .from("event_orders")
    .insert({
      event_id: event.data.id,
      ticket_id: ticket.data.id,
      buyer_user_id: buyer.userId,
      buyer_email: buyer.email,
      buyer_name: "SAN-1576 QA Buyer",
      quantity: 2,
      total_cents: 180_000,
      short_id: `SAN1576-${run}`,
      access_token: fixtureAccessToken, // nosemgrep -- generated per run, not a credential
      status: "paid",
    })
    .select("id")
    .single();
  if (order.error || !order.data) {
    throw new Error(`order insert failed: ${order.error?.message ?? "no row"}`);
  }

  const attendee = await admin.from("event_attendees").insert({
    id: randomUUID(),
    order_id: order.data.id,
    ticket_id: ticket.data.id,
    event_id: event.data.id,
    email: buyer.email,
    full_name: "SAN-1576 QA Buyer",
    qr_token: randomUUID(), // nosemgrep -- generated per run, not a credential
  });
  if (attendee.error) {
    throw new Error(`attendee insert failed: ${attendee.error.message}`);
  }

  const collection = await admin
    .from("collections")
    .insert({
      user_id: buyer.userId,
      name: `SAN-1576 saved ${run}`,
      emoji: "🏠",
    })
    .select("id")
    .single();
  if (collection.error || !collection.data) {
    throw new Error(
      `collection insert failed: ${collection.error?.message ?? "no row"}`,
    );
  }

  return {
    eventName,
    eventId: event.data.id,
    ticketId: ticket.data.id,
    orderId: order.data.id,
    collectionId: collection.data.id,
  };
}

async function cleanupFixture(
  admin: Admin,
  fixture: Fixture,
  buyerId: string,
): Promise<void> {
  await admin.from("event_attendees").delete().eq("order_id", fixture.orderId);
  await admin.from("event_orders").delete().eq("id", fixture.orderId);
  await admin.from("event_tickets").delete().eq("id", fixture.ticketId);
  await admin.from("events").delete().eq("id", fixture.eventId);
  await admin.from("collections").delete().eq("id", fixture.collectionId);

  const [orders, collections] = await Promise.all([
    admin
      .from("event_orders")
      .select("id", { count: "exact", head: true })
      .eq("buyer_user_id", buyerId),
    admin
      .from("collections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", buyerId),
  ]);
  expect([orders.count, collections.count]).toEqual([0, 0]);
}

async function signInAndOpenPersonal(
  page: import("@playwright/test").Page,
  origin: string,
  email: string,
): Promise<void> {
  await signInAsOnOrigin(page, origin, email);
  await page.goto("/app");
  const card = page.getByTestId("workspace-card-personal");
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    "/app/me",
  );
  await page.goto("/app/me", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app\/me$/, { timeout: 45_000 });
}

test.describe("SAN-1576 /app personal", { tag: ["@app", "@personal"] }, () => {
  test.setTimeout(240_000);
  test.skip(!hasE2eEnv(), "Supabase e2e env is not configured");

  test("guest returns to login with the exact Personal path", async ({ page }) => {
    await page.goto("/app/me", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fme$/);
    await expect(page.getByTestId("personal-workspace")).toHaveCount(0);
  });

  test("buyer sees own saved collection and paid pass; other buyer gets one not-found", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const admin = await getSupabaseAdmin();
    const buyer = await createThrowawayIdentity("san1576-buyer");
    const other = await createThrowawayIdentity("san1576-other");
    const run = randomUUID().slice(0, 8);
    let fixture: Fixture | null = null;

    try {
      fixture = await seedFixture(admin, buyer, run);
      await signInAndOpenPersonal(page, origin, buyer.email);

      await expect(page.getByTestId("me-card-tickets")).toContainText("1", {
        timeout: 45_000,
      });
      await expect(page.getByTestId("me-card-saved")).toContainText("1");

      await page.getByTestId("me-nav-saved").click();
      await expect(page).toHaveURL(/\/app\/me\/saved$/, { timeout: 45_000 });
      await expect(page.getByText(`SAN-1576 saved ${run}`)).toBeVisible();
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText(`SAN-1576 saved ${run}`)).toBeVisible();

      await page.getByTestId("me-nav-tickets").click();
      await expect(page).toHaveURL(/\/app\/me\/tickets$/, { timeout: 45_000 });
      await expect(page.getByText(fixture.eventName)).toBeVisible();
      await page.getByTestId("my-tickets-show-qr").click();
      await page.waitForURL(
        (url) => url.pathname === `/app/me/tickets/${fixture?.orderId}`,
        { timeout: 45_000 },
      );
      await expect(page.getByTestId("my-tickets-qr")).toBeVisible({
        timeout: 30_000,
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("my-tickets-qr")).toBeVisible({
        timeout: 30_000,
      });

      await signInAsOnOrigin(page, origin, other.email);
      const foreign = await page.goto(`/app/me/tickets/${fixture.orderId}`);
      expect(foreign?.status()).toBe(404);
      const missing = await page.goto(
        "/app/me/tickets/00000000-0000-0000-0000-000000000000",
      );
      expect(missing?.status()).toBe(404);

      await signInAsOnOrigin(page, origin, buyer.email);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/app/me/tickets");
      await expect(page.getByText(fixture.eventName)).toBeVisible();
      const widths = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        screen: window.innerWidth,
      }));
      expect(widths.page).toBeLessThanOrEqual(widths.screen);
    } finally {
      if (fixture) await cleanupFixture(admin, fixture, buyer.userId);
      await deleteThrowawayIdentity(buyer);
      await deleteThrowawayIdentity(other);
    }
  });
});
