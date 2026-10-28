import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createThrowawayIdentity, getSupabaseAdmin, signInAs, type ThrowawayIdentity } from "./helpers/auth";

// Explicitly opt in: fixture writes must never target production Supabase.
const LOCAL = process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http://127.0.0.1:") ?? false;
test.skip(!LOCAL || process.env.MDE_LOCAL_ADMIN_QA !== "1",
  "Requires local Supabase plus MDE_LOCAL_ADMIN_QA=1");

test("host attendee paging, searching, refresh, isolation, mobile and real order totals", async ({ page, browser }) => {
  const admin = await getSupabaseAdmin();
  const people: ThrowawayIdentity[] = [];
  const tag = randomUUID().slice(0, 8);
  let eventId: string | null = null;
  const check = (error: { message: string } | null, where: string) =>
    expect(error, `${where}: ${error?.message}`).toBeNull();
  fs.mkdirSync("tmp/qa/pr552-local", { recursive: true });
  try {
    const host = await createThrowawayIdentity("pr552-paging-host"); people.push(host);
    const outsider = await createThrowawayIdentity("pr552-paging-outsider"); people.push(outsider);
    const event = await admin.from("events").insert({
      name: `PR552 attendee paging ${tag}`, organizer_id: host.userId,
      event_start_time: "2027-05-05T21:00:00Z", status: "published",
      is_active: true, source: "manual",
    }).select("id").single();
    check(event.error, "create local-only event"); eventId = event.data!.id;
    const ticket = await admin.from("event_tickets").insert({
      event_id: eventId, name: "Local QA tier", qty_total: 100, qty_sold: 52,
      price_cents: 1000, currency: "COP",
    }).select("id").single();
    check(ticket.error, "create local-only tier");

    // Six ordinary-sized orders, all with the same DB creation timestamp.
    const orders = await admin.from("event_orders").insert(
      Array.from({ length: 6 }, (_, i) => ({
        event_id: eventId, ticket_id: ticket.data!.id,
        quantity: i === 5 ? 2 : 10, total_cents: (i === 5 ? 2 : 10) * 1000,
        subtotal_cents: (i === 5 ? 2 : 10) * 1000,
        buyer_name: "QA buyer", buyer_email: "qa-buyer@example.invalid",
        status: "paid", short_id: `SAN982-${tag}-${i}`, access_token: `san982-qa-${tag}-${i}`,
        currency: "COP",
      })),
    ).select("id,short_id");
    check(orders.error, "create local-only orders");
    expect(orders.data).toHaveLength(6);
    const attendees = orders.data!.flatMap((order, batch) =>
      Array.from({ length: batch === 5 ? 2 : 10 }, (_, j) => {
        const n = batch * 10 + j + 1;
        return {
          id: randomUUID(), event_id: eventId!, ticket_id: ticket.data!.id,
          order_id: order.id, status: "active",
          full_name: `Guest ${String(n).padStart(3, "0")}`,
          email: `guest${String(n).padStart(3, "0")}@example.invalid`,
          qr_token: `san982-${tag}-${n}`,
        };
      }),
    );
    check((await admin.from("event_attendees").insert(attendees)).error, "create attendee test rows");

    await signInAs(page, host.email);
    await page.goto(`http://localhost:3071/app/events/tickets?event=${eventId}`);
    await expect(page.getByTestId("tickets-kpi-sold")).toHaveText("52", { timeout: 30000 });
    await expect(page.getByTestId("tickets-kpi-orders")).toHaveText("6");
    await expect(page.getByTestId("tickets-kpi-revenue")).not.toHaveText("—");
    const attendeeUrl = `http://localhost:3071/app/events/attendees?event=${eventId}`;
    await page.goto(attendeeUrl);
    await expect(page.getByTestId("host-attendees-table").locator("tbody tr")).toHaveCount(50);
    await expect(page.getByTestId("host-attendees-pagination")).toContainText("Page 1 of 2");
    await page.getByTestId("host-attendees-next").click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId("host-attendees-table").locator("tbody tr")).toHaveCount(2);
    const secondPage = await page.getByTestId("host-attendees-table").locator("tbody tr").allTextContents();
    await page.reload();
    expect(await page.getByTestId("host-attendees-table").locator("tbody tr").allTextContents()).toEqual(secondPage);
    await page.getByTestId("host-attendees-prev").click();
    await expect(page.getByTestId("host-attendees-table").locator("tbody tr")).toHaveCount(50);
    await page.locator('input[name="q"]').fill("guest051");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByTestId("host-attendees-table").locator("tbody tr")).toHaveCount(1);
    await expect(page.getByTestId("host-attendees-table")).toContainText("Guest 051");
    await page.goto(`${attendeeUrl}&q=guest051&page=99999`);
    await expect(page.getByTestId("host-attendees-pagination")).toContainText("Page 1 of 1");
    await expect(page).not.toHaveURL(/page=99999/);

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const m = await mobile.newPage();
      await signInAs(m, host.email);
      await m.goto(attendeeUrl);
      await expect(m.getByTestId("host-attendees-next")).toBeVisible();
      await m.screenshot({ path: "tmp/qa/pr552-local/attendee-paging-390.png", fullPage: true });
    } finally { await mobile.close(); }
    const foreign = await browser.newContext();
    try {
      const denied = await foreign.newPage();
      await signInAs(denied, outsider.email);
      for (const route of ["tickets", "attendees", "check-in"]) {
        await denied.goto(`http://localhost:3071/app/events/${route}?event=${eventId}`);
        await expect(denied.getByTestId(`host-${route}`)).toHaveCount(0);
      }
    } finally { await foreign.close(); }
    const anonymous = await browser.newContext();
    try {
      const guest = await anonymous.newPage();
      await guest.goto(attendeeUrl);
      await expect(guest).toHaveURL(/\/login/);
    } finally { await anonymous.close(); }
  } finally {
    const problems: string[] = [];
    const clear = async (table: string, field: string, value: string) => {
      const { error } = await admin.from(table).delete().eq(field, value);
      if (error) problems.push(`${table}: ${error.message}`);
    };
    if (eventId) {
      for (const table of ["event_attendees", "event_orders", "event_tickets"]) {
        await clear(table, "event_id", eventId);
      }
      await clear("events", "id", eventId);
      for (const table of ["event_attendees", "event_orders", "event_tickets", "events"]) {
        const field = table === "events" ? "id" : "event_id";
        const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(field, eventId);
        if (error || count !== 0) problems.push(`${table}: remaining ${count ?? "unknown"} ${error?.message ?? ""}`);
      }
    }
    for (const person of people) {
      const { error } = await admin.auth.admin.deleteUser(person.userId);
      if (error) problems.push(`QA user cleanup: ${error.message}`);
    }
    expect(problems, "local fixture cleanup").toEqual([]);
  }
});
