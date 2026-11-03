import path from "node:path";

import { test, expect, type Page } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "../helpers/auth";
import { cleanupFixtures, createPartner, type Admin } from "../helpers/partner-fixtures";

const QA_DIR = "tmp/qa/san-1540";
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3001";

test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
});

test.describe.configure({ timeout: 240_000 });

type Fixture = {
  admin: Admin;
  partnerA: string;
  partnerB: string;
  restaurantA: CreatedRestaurant;
  restaurantB: CreatedRestaurant;
  identityA: ThrowawayIdentity;
  identityB: ThrowawayIdentity;
  identityCustomer: ThrowawayIdentity;
};

type CreatedRestaurant = {
  id: string;
  placeId: string;
  originalDescription: string;
};

async function createRestaurant(
  admin: Admin,
  partnerId: string,
  name: string,
  placeId: string,
): Promise<CreatedRestaurant> {
  const originalDescription = `${name} original description`;
  const { data, error } = await admin
    .from("restaurants")
    .insert({
      name,
      partner_id: partnerId,
      google_place_id: placeId,
      description: originalDescription,
      website: "https://original.example",
      is_active: true,
      source: "manual",
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  if (!data) throw new Error("restaurant insert returned no row");
  return { id: data.id, placeId, originalDescription };
}

async function buildFixture(): Promise<Fixture> {
  const admin = await getSupabaseAdmin();
  const suffix = crypto.randomUUID().slice(0, 8);
  const identities: ThrowawayIdentity[] = [];
  const partnerIds: string[] = [];
  const restaurantIds: string[] = [];
  try {
    const identityA = await createThrowawayIdentity(`san1540-a-${suffix}`);
    identities.push(identityA);
    const identityB = await createThrowawayIdentity(`san1540-b-${suffix}`);
    identities.push(identityB);
    const identityCustomer = await createThrowawayIdentity(`san1540-c-${suffix}`);
    identities.push(identityCustomer);
    const partnerA = await createPartner(admin, identityA.userId, "venue", {
      businessName: `Cafe Norte ${suffix}`,
    });
    partnerIds.push(partnerA);
    const partnerB = await createPartner(admin, identityB.userId, "venue", {
      businessName: `Cafe Sur ${suffix}`,
    });
    partnerIds.push(partnerB);
    const restaurantA = await createRestaurant(admin, partnerA,
      `Restaurant A ${suffix}`, `san1540-place-a-${suffix}`);
    restaurantIds.push(restaurantA.id);
    const restaurantB = await createRestaurant(admin, partnerB,
      `Restaurant B ${suffix}`, `san1540-place-b-${suffix}`);
    restaurantIds.push(restaurantB.id);
    return { admin, partnerA, partnerB, restaurantA, restaurantB,
      identityA, identityB, identityCustomer };
  } catch (setupError) {
    // If setup fails midway, afterEach never receives a completed fixture.
    try {
      if (restaurantIds.length) {
        for (const table of ["venue_booking_requests", "restaurant_menu_items", "restaurants"] as const) {
          const { error } = await admin.from(table).delete()
            .in(table === "restaurants" ? "id" : "restaurant_id", restaurantIds);
          if (error) throw new Error(`fixture cleanup of ${table}: ${error.message}`);
        }
      }
      await cleanupFixtures(admin, partnerIds, identities);
    } catch (cleanupError) {
      throw new AggregateError([setupError, cleanupError],
        "Restaurant fixture setup and partial cleanup both failed");
    }
    throw setupError;
  }
}

async function cleanup(fixture: Fixture | null): Promise<void> {
  if (!fixture) return;
  const { admin } = fixture;
  const restaurantIds = [fixture.restaurantA.id, fixture.restaurantB.id];
  const partnerIds = [fixture.partnerA, fixture.partnerB];

  // Requests, menu rows and locations belong to this run only.
  await admin.from("venue_booking_requests").delete().in("restaurant_id", restaurantIds);
  await admin.from("restaurant_menu_items").delete().in("restaurant_id", restaurantIds);
  await admin.from("partner_locations").delete().in("partner_id", partnerIds);
  const restaurants = await admin.from("restaurants").delete().in("id", restaurantIds);
  expect(restaurants.error, restaurants.error?.message).toBeNull();
  await admin.from("partner_members").delete().in("partner_id", partnerIds);
  const partners = await admin.from("partners").delete().in("id", partnerIds);
  expect(partners.error, partners.error?.message).toBeNull();

  for (const identity of [fixture.identityA, fixture.identityB, fixture.identityCustomer]) {
    await deleteThrowawayIdentity(identity);
  }

  const leftoverRestaurants = await admin
    .from("restaurants")
    .select("id")
    .in("id", restaurantIds);
  expect(leftoverRestaurants.data ?? []).toHaveLength(0);
  const leftoverPartners = await admin.from("partners").select("id").in("id", partnerIds);
  expect(leftoverPartners.data ?? []).toHaveLength(0);
  const leftoverRequests = await admin
    .from("venue_booking_requests")
    .select("id")
    .in("restaurant_id", restaurantIds);
  expect(leftoverRequests.data ?? []).toHaveLength(0);
  const leftoverMenu = await admin
    .from("restaurant_menu_items")
    .select("id")
    .in("restaurant_id", restaurantIds);
  expect(leftoverMenu.data ?? []).toHaveLength(0);
  const leftoverLocations = await admin
    .from("partner_locations")
    .select("id")
    .in("partner_id", partnerIds);
  expect(leftoverLocations.data ?? []).toHaveLength(0);
}

async function signInPartner(page: Page, email: string) {
  await signInAsOnOrigin(page, BASE, email);
}

async function openAssignedRestaurant(page: Page, fixture: Fixture) {
  await page.goto(`/app/partners/restaurants?partner=${fixture.partnerA}`);
  await expect(page.getByTestId("partner-restaurants")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("partner-restaurants-list").getByText(`Restaurant A`).first().click();
  // The first client navigation compiles the editor route on a cold dev server.
  await expect(page.getByTestId("restaurant-owner-form")).toBeVisible({ timeout: 30_000 });
}

test.describe("SAN-1540 restaurant owner workspace", () => {
  test.skip(!hasE2eEnv(), "Supabase e2e env missing");

  let fixture: Fixture | null = null;

  test.afterEach(async () => {
    await cleanup(fixture);
    fixture = null;
  });

  test("a guest is sent to sign in with a local return path", async ({ page }) => {
    await page.goto("/app/partners/restaurants");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fpartners%2Frestaurants/);
  });

  test("SAN-1602 live NVIDIA website → review → owner save → DB readback", async ({ page }) => {
    test.skip(process.env.MDE_RESTAURANT_LIVE_SOURCE_E2E !== "1",
      "Opt-in real NVIDIA + real Supabase: MDE_RESTAURANT_LIVE_SOURCE_E2E=1");
    test.setTimeout(180_000);
    const sourceUrl = "https://co.pergamino.co/pages/quienes-somos";
    fixture = await buildFixture();
    await signInPartner(page, fixture.identityA.email);
    await openAssignedRestaurant(page, fixture);

    // This is a read-only draft: the stored restaurant must remain unchanged.
    const before = await fixture.admin.from("restaurants")
      .select("description").eq("id", fixture.restaurantA.id).single();
    expect(before.error).toBeNull();
    const reply = page.waitForResponse(response =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/partners/restaurants/${fixture!.restaurantA.id}/website-import`,
      { timeout: 40_000 },
    );
    await page.getByLabel("Restaurant website").fill(sourceUrl);
    await page.getByRole("button", { name: "Read website" }).click();
    const response = await reply;
    expect(response.status()).toBe(200);
    const result = await response.json() as {
      success?: boolean; draft?: { sources?: string[]; name?: string };
    };
    expect(result.success).toBe(true);
    expect(result.draft?.name?.toLowerCase()).toContain("pergamino");
    expect(result.draft?.sources).toContain(sourceUrl);
    await expect(page.getByTestId("restaurant-import-proposal")).toBeVisible();
    const unchanged = await fixture.admin.from("restaurants")
      .select("description").eq("id", fixture.restaurantA.id).single();
    expect(unchanged.data?.description).toBe(before.data?.description);

    await page.getByRole("button", { name: "Apply to form" }).click();
    const editedDescription = "QA manual edit after real NVIDIA website extraction";
    await page.getByTestId("restaurant-description").fill(editedDescription);
    await page.getByTestId("restaurant-save").click();
    await expect(page.getByTestId("restaurant-saved")).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByTestId("restaurant-description")).toHaveValue(editedDescription);

    const stored = await fixture.admin.from("restaurants")
      .select("id,description,website,partner_id")
      .eq("id", fixture.restaurantA.id).single();
    expect(stored.error).toBeNull();
    expect(stored.data).toMatchObject({
      id: fixture.restaurantA.id, partner_id: fixture.partnerA,
      description: editedDescription, website: sourceUrl,
    });
    // The real partner authorization remains the only way to import.
    const forbidden = await page.request.post(
      `/api/partners/restaurants/${fixture.restaurantB.id}/website-import`,
      { data: { url: sourceUrl } },
    );
    expect(forbidden.status()).toBe(403);
    console.log("SAN1602_RESTAURANT_NVIDIA_E2E_PASS",
      JSON.stringify({ sourceConfirmed: true, imported: response.status(),
        editPersisted: true, tenantDenied: forbidden.status(), savedRecordCount: 1 }));
  });

  test("partner A edits the assigned restaurant, reloads it, and cannot reach B", async ({
    page,
  }) => {
    fixture = await buildFixture();
    await signInPartner(page, fixture.identityA.email);
    await openAssignedRestaurant(page, fixture);

    const description = page.getByTestId("restaurant-description");
    const nextDescription = "Real description saved by the partner";
    await description.fill(nextDescription);

    // A failed save is shown truthfully and must not persist.
    await page.locator("#restaurant-website").fill("not-a-url");
    await page.getByTestId("restaurant-save").click();
    await expect(page.getByTestId("restaurant-save-error")).toContainText(/valid http/i);

    await page.locator("#restaurant-website").fill("https://cafe-norte.example");
    await page.getByTestId("restaurant-save").click();
    await expect(page.getByTestId("restaurant-saved")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("restaurant-description")).toHaveValue(nextDescription);

    const stored = await fixture.admin
      .from("restaurants")
      .select("description, website, partner_id")
      .eq("id", fixture.restaurantA.id)
      .single();
    expect(stored.error, stored.error?.message).toBeNull();
    expect(stored.data).toMatchObject({
      description: nextDescription,
      website: "https://cafe-norte.example",
      partner_id: fixture.partnerA,
    });

    const untouched = await fixture.admin
      .from("restaurants")
      .select("description")
      .eq("id", fixture.restaurantB.id)
      .single();
    expect(untouched.data?.description).toBe(fixture.restaurantB.originalDescription);

    // The canonical assignment cannot be rewritten as a listing field.
    const forged = await page.request.patch(
      `/api/partners/restaurants/${fixture.restaurantA.id}`,
      { data: { partner_id: fixture.partnerB } },
    );
    expect(forged.status()).toBe(400);

    // Partner B's own restaurant is denied to partner A through the API too.
    const denied = await page.request.patch(
      `/api/partners/restaurants/${fixture.restaurantB.id}`,
      { data: { description: "hijack" } },
    );
    expect(denied.status()).toBe(403);

    // Direct navigation to B's editor renders the honest unavailable state.
    await page.goto(`/app/partners/restaurants/${fixture.restaurantB.id}`);
    await expect(page.getByTestId("restaurant-owner-unavailable")).toBeVisible();

    await page.screenshot({ path: path.join(QA_DIR, "owner-editor-desktop.png"), fullPage: true });
  });

  test("a spoofed Google Place ID does not authorize another restaurant", async ({ page }) => {
    fixture = await buildFixture();
    await signInPartner(page, fixture.identityA.email);

    // A partner member may edit their own partner_locations row (the documented risk).
    const location = await fixture.admin
      .from("partner_locations")
      .insert({
        partner_id: fixture.partnerA,
        google_place_id: fixture.restaurantB.placeId,
      })
      .select("id")
      .single();
    expect(location.error, location.error?.message).toBeNull();

    const denied = await page.request.patch(
      `/api/partners/restaurants/${fixture.restaurantB.id}`,
      { data: { description: "spoofed" } },
    );
    expect(denied.status()).toBe(403);

    const stored = await fixture.admin
      .from("restaurants")
      .select("description")
      .eq("id", fixture.restaurantB.id)
      .single();
    expect(stored.data?.description).toBe(fixture.restaurantB.originalDescription);
  });

  test("customer request appears once in the correct partner inbox with its real status", async ({
    page,
  }) => {
    fixture = await buildFixture();
    await signInAsOnOrigin(page, BASE, fixture.identityCustomer.email);

    const requestedAt = "2026-12-01T20:00";
    await page.goto(`/restaurants/${fixture.restaurantA.id}`);
    await page.getByTestId("restaurant-request-open").click();
    const form = page.getByTestId("venue-booking-form");
    await expect(form).toBeVisible();
    await form.locator('input[name="contactName"]').fill("QA Customer");
    await form.locator('input[name="contactEmail"]').fill(fixture.identityCustomer.email);
    await form.locator('input[name="requestedAt"]').fill(requestedAt);
    await form.locator('input[name="partySize"]').fill("2");
    await form.getByTestId("venue-booking-submit").click();

    // The first hit compiles the booking route in dev; allow the real round-trip.
    await expect(page.getByTestId("restaurant-request-submitted")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("venue-booking-error")).toHaveCount(0);
    const reference = await page.getByTestId("restaurant-request-submitted").textContent();
    expect(reference).toBeTruthy();

    const persisted = await fixture.admin
      .from("venue_booking_requests")
      .select("id, status, restaurant_id, user_id")
      .eq("restaurant_id", fixture.restaurantA.id);
    expect(persisted.error, persisted.error?.message).toBeNull();
    expect(persisted.data).toHaveLength(1);
    expect(persisted.data?.[0]).toMatchObject({
      status: "pending",
      restaurant_id: fixture.restaurantA.id,
      user_id: fixture.identityCustomer.userId,
    });

    // The customer sees the stored status, not a fabricated confirmation.
    await page.reload();
    await expect(page.getByTestId("restaurant-request-status")).toContainText(/pending/i);

    // Retrying the SAME request is safe: the stored idempotency key refuses the
    // duplicate and the database still holds exactly one row.
    const storedKey = await fixture.admin
      .from("venue_booking_requests")
      .select("idempotency_key, requested_at")
      .eq("restaurant_id", fixture.restaurantA.id)
      .single();
    expect(storedKey.error, storedKey.error?.message).toBeNull();
    const duplicate = await page.request.post("/api/venue-booking/request", {
      data: {
        venueKind: "restaurant",
        placeId: fixture.restaurantA.placeId,
        restaurantId: fixture.restaurantA.id,
        requestedAt: new Date(String(storedKey.data?.requested_at)).toISOString(),
        partySize: 2,
        contactName: "QA Customer",
        contactEmail: fixture.identityCustomer.email,
        idempotencyKey: storedKey.data?.idempotency_key,
      },
    });
    expect(duplicate.status()).toBe(409);
    const afterRetry = await fixture.admin
      .from("venue_booking_requests")
      .select("id")
      .eq("restaurant_id", fixture.restaurantA.id);
    expect(afterRetry.data).toHaveLength(1);

    // Partner A sees the real request; partner B sees the empty state for their own restaurant.
    await signInPartner(page, fixture.identityA.email);
    await openAssignedRestaurant(page, fixture);
    await expect(page.getByTestId("restaurant-requests-list")).toBeVisible();
    await expect(page.getByTestId("restaurant-reservation-inbox")).toContainText("QA Customer");
    await expect(page.getByTestId("restaurant-reservation-inbox")).toContainText("Request pending");

    await page.goto(`/app/partners/restaurants/${fixture.restaurantB.id}`);
    await expect(page.getByTestId("restaurant-owner-unavailable")).toBeVisible();

    await page.screenshot({ path: path.join(QA_DIR, "reservation-inbox.png"), fullPage: true });
  });

  test("menu and photos save, reload and appear on the public restaurant page", async ({
    page,
  }) => {
    fixture = await buildFixture();
    await signInPartner(page, fixture.identityA.email);
    await openAssignedRestaurant(page, fixture);

    await page.getByLabel("New menu section").fill("Starters");
    await page.getByLabel("New menu item name").fill("Arepas de queso");
    await page.getByLabel("New menu item price").fill("18000");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(
      page.getByTestId("restaurant-menu-item").getByLabel("Menu item name").first(),
    ).toHaveValue("Arepas de queso");

    await page.getByLabel("Add an image URL").fill("https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800");
    await page.getByLabel("Photo source (optional)").fill("Unsplash");
    await page.getByRole("button", { name: "Add photo" }).click();
    await page.getByTestId("restaurant-save").click();
    await expect(page.getByTestId("restaurant-saved")).toBeVisible();

    await page.reload();
    await expect(
      page.getByTestId("restaurant-menu-item").getByLabel("Menu item name").first(),
    ).toHaveValue("Arepas de queso");
    await expect(page.getByTestId("restaurant-photo-item")).toBeVisible();

    const menu = await fixture.admin
      .from("restaurant_menu_items")
      .select("name, price_amount, currency")
      .eq("restaurant_id", fixture.restaurantA.id);
    expect(menu.data).toMatchObject([{ name: "Arepas de queso", price_amount: 18000, currency: "COP" }]);

    const publicPage = await page.context().newPage();
    await publicPage.goto(`/restaurants/${fixture.restaurantA.id}`);
    await expect(publicPage.getByTestId("restaurant-public-menu")).toContainText("Arepas de queso");
    await expect(publicPage.getByTestId("restaurant-public-gallery")).toBeVisible();
    await publicPage.screenshot({ path: path.join(QA_DIR, "public-restaurant.png"), fullPage: true });
    await publicPage.close();
  });
});

test.describe("SAN-1540 restaurant owner workspace at 390px", () => {
  test.skip(!hasE2eEnv(), "Supabase e2e env missing");
  test.use({ viewport: { width: 390, height: 844 } });

  test("list and editor fit a phone without horizontal overflow", async ({ page }) => {
    const fixture = await buildFixture();
    try {
      await signInPartner(page, fixture.identityA.email);
      await page.goto(`/app/partners/restaurants?partner=${fixture.partnerA}`);
      await expect(page.getByTestId("partner-restaurants")).toBeVisible();
      const listWidth = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(listWidth).toBeLessThanOrEqual(1);

      await openAssignedRestaurant(page, fixture);
      const editorWidth = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(editorWidth).toBeLessThanOrEqual(1);
      await page.screenshot({ path: path.join(QA_DIR, "owner-editor-390.png"), fullPage: true });
    } finally {
      await cleanup(fixture);
    }
  });
});
