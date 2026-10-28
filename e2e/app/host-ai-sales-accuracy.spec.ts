import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  injectSession,
  type ThrowawayIdentity,
} from "../helpers/auth";

/**
 * SAN-1396 · Test and Monitor MDE Host, Events and Concierge AI Reliability —
 * opt-in live proof that Host Ops reports the REAL database figures.
 *
 * One throwaway host owns one DRAFT event (never public) with one paid order of
 * known size. The host asks Host Ops about sales at phone and desktop width; the
 * reply must contain the seeded figures, and a follow-up must name the event.
 * Every row written is deleted and re-queried; nothing here publishes an event.
 */
test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
  trace: "off", screenshot: "off", video: "off",
});

const base = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
test.skip(!base, "Opt in with PROD_SMOKE_BASE_URL and PW_SKIP_WEBSERVER=1");

const GROSS_CENTS = 180_000; // 2 tickets x 90_000, as stored in event_orders.total_cents
const TICKETS = 2;
const DISPLAYED_TOTAL = GROSS_CENTS / 100; // formatMoney: cents -> COP units

type Admin = Awaited<ReturnType<typeof getSupabaseAdmin>>;

async function seedDraftWithPaidOrder(admin: Admin, host: ThrowawayIdentity, run: string) {
  const name = `SAN-1396 QA draft ${run} (not a real event)`;
  const { data: event, error } = await admin.from("events").insert({
    source: "manual",
    name,
    slug: `qa-san1396-${run}`,
    description: "Synthetic SAN-1396 development fixture. Not a real event.",
    city: "Medellín", country: "CO", currency: "COP",
    event_start_time: "2027-06-12T20:00:00-05:00",
    status: "draft", organizer_id: host.userId, is_active: true,
  }).select("id").single();
  if (error || !event) throw new Error(`event insert failed: ${error?.message}`);
  const { data: ticket, error: tErr } = await admin.from("event_tickets").insert({
    event_id: event.id, name: "GA", price_cents: 90_000, qty_total: 10, qty_sold: TICKETS, currency: "COP",
  }).select("id").single();
  if (tErr || !ticket) throw new Error(`ticket insert failed: ${tErr?.message}`);
  const { error: oErr } = await admin.from("event_orders").insert({
    event_id: event.id, ticket_id: ticket.id,
    buyer_email: `san1396-${run}@qa-isolation.mdeai.co`, buyer_name: "SAN-1396 QA Buyer",
    quantity: TICKETS, total_cents: GROSS_CENTS, currency: "COP",
    short_id: `SAN1396-${run}`,
    access_token: randomUUID().replaceAll("-", ""), // nosemgrep -- generated per run, not a credential
    status: "paid",
  });
  if (oErr) throw new Error(`order insert failed: ${oErr.message}`);
  return { eventId: event.id as string, name };
}

async function removeFixture(admin: Admin, host: ThrowawayIdentity): Promise<string[]> {
  const failures: string[] = [];
  const { data: events } = await admin.from("events").select("id").eq("organizer_id", host.userId);
  const ids = (events ?? []).map((e) => e.id as string);
  if (ids.length) {
    for (const table of ["event_orders", "event_tickets"] as const) {
      const r = await admin.from(table).delete().in("event_id", ids);
      if (r.error) failures.push(`delete ${table}: ${r.error.message}`);
    }
    const r = await admin.from("events").delete().in("id", ids);
    if (r.error) failures.push(`delete events: ${r.error.message}`);
  }
  for (const [table, col, vals] of [
    ["events", "organizer_id", [host.userId]],
    ["event_orders", "event_id", ids],
    ["event_tickets", "event_id", ids],
  ] as const) {
    if (!vals.length) continue;
    const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).in(col, [...vals]);
    if (error) failures.push(`verify ${table}: ${error.message}`);
    else if ((count ?? 0) !== 0) failures.push(`${table} left ${count} rows`);
  }
  return failures;
}

type HostRun = { host: ThrowawayIdentity; admin: Admin; page: Page; context: BrowserContext; consoleErrors: string[] };

/**
 * Cleanup scope starts the moment the identity exists, so a failure in newContext/newPage still
 * deletes it. Identity deletion is the last step and cannot be skipped by an earlier cleanup failure.
 */
async function withThrowawayHost(
  browser: Browser,
  label: string,
  width: number,
  body: (ctx: HostRun) => Promise<void>,
): Promise<void> {
  if (!hasE2eEnv()) throw new Error("Missing real Supabase QA credentials");
  const admin = await getSupabaseAdmin();
  const host = await createThrowawayIdentity(label);
  let context: BrowserContext | undefined;
  let fixtureFailures: string[] = [];
  try {
    context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(e.message));
    await body({ host, admin, page, context, consoleErrors });
  } finally {
    try {
      fixtureFailures = await removeFixture(admin, host);
    } finally {
      try {
        await context?.close();
      } finally {
        await deleteThrowawayIdentity(host);
      }
    }
  }
  expect(fixtureFailures).toEqual([]);
}

async function signInHost(ctx: HostRun, path: string) {
  const origin = new URL(base);
  await injectSession(ctx.context, await getTestSession(ctx.host.email), {
    host: origin.hostname, secure: origin.protocol === "https:",
  });
  await ctx.page.goto(new URL(path, base).toString(), { waitUntil: "domcontentloaded" });
}

async function expectNoOverflow(page: Page) {
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: window.innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.screen);
}

for (const width of [390, 1440]) {
  test(`SAN-1396: Host Ops reports seeded sales figures at ${width}px`, async ({ browser }) => {
    test.setTimeout(240_000);
    await withThrowawayHost(browser, "san1396-host", width, async (ctx) => {
      const { host, admin, page, consoleErrors } = ctx;
      const run = randomUUID().slice(0, 8);
      const fixture = await seedDraftWithPaidOrder(admin, host, run);
      await signInHost(ctx, "/app/events/overview");
      const rail = page.getByTestId("host-os-chat-region");
      await expect(rail).toBeVisible({ timeout: 45_000 });
      const editor = rail.locator("textarea").first();
      const send = rail.getByTestId("copilot-send-button");

      async function ask(text: string) {
        await expect(async () => {
          await editor.fill("");
          await editor.pressSequentially(text, { delay: 8 });
          await expect(send).toBeEnabled({ timeout: 1_500 });
        }).toPass({ timeout: 20_000 });
        await editor.press("Enter");
      }

      await ask("How are my event ticket sales?");
      // formatMoney shows 180000 cents as COP 1,800. Accepting 180,000 would let a 100x error pass,
      // so every "COP <amount>" in the reply must be exactly the displayed seeded total.
      const copAmounts = async () => {
        const text = await rail.innerText();
        return [...text.matchAll(/COP\s*([\d.,]+)/gi)].map((m) => Number(m[1].replace(/[.,]/g, "")));
      };
      // Poll until the streamed reply is complete: amounts present and ALL equal to the seeded total.
      // A wrong total never converges, so a wrong answer still fails at the timeout.
      await expect.poll(async () => {
        const amounts = await copAmounts();
        return amounts.length > 0 && amounts.every((n) => n === DISPLAYED_TOTAL);
      }, { timeout: 90_000, intervals: [2000, 3000, 5000] }).toBe(true);
      const ticketsRe = new RegExp(`\\b${TICKETS}\\s+tickets?\\b`, "i");
      await expect.poll(async () => ticketsRe.test(await rail.innerText()), { timeout: 30_000 }).toBe(true);
      const afterFirst = await rail.innerText();
      console.log("SAN1396_SALES_REPLY", JSON.stringify(afterFirst.slice(-400)));

      await ask("Which event is that for?");
      await expect(rail).toContainText(new RegExp(`qa draft ${run}`, "i"), { timeout: 90_000 });
      expect(fixture.name).toContain(run);
      await expectNoOverflow(page);
      expect(consoleErrors).toEqual([]);
    });
  });
}

for (const width of [390, 1440]) {
  test(`SAN-1396: Host Event Wizard fills the form from chat and writes nothing at ${width}px`, async ({ browser }) => {
    test.setTimeout(240_000);
    await withThrowawayHost(browser, "san1396-wizard", width, async (ctx) => {
      const { host, admin, page, consoleErrors } = ctx;
      await signInHost(ctx, "/app/events/new");
      const wizard = page.getByTestId("host-event-wizard");
      await expect(wizard).toBeVisible({ timeout: 45_000 });
      // The form's description field is also a textarea; type into the chat region only.
      const chat = page.getByTestId("host-copilot-chat-region");
      const editor = chat.locator("textarea").first();
      const send = chat.getByTestId("copilot-send-button");
      const prompt = 'Fill the form for an event titled "SAN-1396 QA Salsa Night" in Laureles, capacity 80, free entry. Do not publish.';
      await expect(async () => {
        await editor.fill("");
        await editor.pressSequentially(prompt, { delay: 8 });
        await expect(send).toBeEnabled({ timeout: 1_500 });
      }).toPass({ timeout: 20_000 });
      await editor.press("Enter");

      await expect(page.getByTestId("host-event-field-neighborhood")).toHaveValue(/laureles/i, { timeout: 90_000 });
      await expect(page.getByTestId("host-event-field-title")).toHaveValue(/Salsa Night/i, { timeout: 30_000 });
      await expect(page.getByTestId("host-event-field-capacity")).toHaveValue("80", { timeout: 30_000 });

      // The wizard only writes when the host approves. Nothing was approved here.
      const { count, error } = await admin.from("events")
        .select("id", { count: "exact", head: true }).eq("organizer_id", host.userId);
      expect(error).toBeNull();
      expect(count).toBe(0);
      // "free entry" was requested: the price field must not carry a positive price.
      await expect(page.getByTestId("host-event-field-price")).toHaveValue(/^0?$/, { timeout: 30_000 });
      await expectNoOverflow(page);
      expect(consoleErrors).toEqual([]);
    });
  });
}
