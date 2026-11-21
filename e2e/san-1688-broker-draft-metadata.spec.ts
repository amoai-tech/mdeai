/**
 * SAN-1688 · saving free-text or Google-selected addresses must not wipe a
 * reused broker draft's provenance metadata.
 *
 *   PLAYWRIGHT_WEB_SERVER_COMMAND="npm run dev:ui:worktree" SMOKE_BASE_URL=http://localhost:3002 \
 *     npx playwright test e2e/san-1688-broker-draft-metadata.spec.ts --project=chromium
 *
 * Why this is an integration test and not a unit test: `apartments.metadata` is
 * provenance-owned. `protect_apartment_provenance` is a BEFORE UPDATE OF metadata
 * trigger that raises 42501 when `is_test_fixture`/`inventory_kind` disappears, so
 * only a real authenticated UPDATE proves the save still succeeds. The spec seeds a
 * draft with fixture/provenance keys (service-role setup), saves as the broker, and
 * asserts the free-text save removes stale place keys and the subsequent
 * Google-selected save adds only verified place keys without losing provenance.
 *
 * It writes real QA rows and therefore removes them and re-queries to prove zero.
 */
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  injectSession,
  type ThrowawayIdentity,
} from "./helpers/auth";


// Authenticated journey: never persist browser artifacts (worker-scoped options).
test.use({ screenshot: "off", trace: "off", video: "off" });

test.describe("SAN-1688 · reused onboarding draft keeps provenance", () => {
  test("saving free-text and Google-selected addresses preserves draft provenance", async ({ page }, testInfo) => {
    test.skip(!hasE2eEnv(), "E2E Supabase env missing");
    test.setTimeout(240_000);

    const identity: ThrowawayIdentity = await createThrowawayIdentity("san1688-metadata");
    const admin: SupabaseClient = await getSupabaseAdmin();
    let landlordProfileId: string | undefined;
    let apartmentId: string | undefined;

    try {
      const session = await getTestSession(identity.email);
      await injectSession(page.context(), session);

      // The /app onboarding route deliberately lets an existing broker start again;
      // /host redirects profile owners to their dashboard.
      await page.goto("/app/rentals/onboarding", { waitUntil: "domcontentloaded" });
      await saveOnboarding(page, "Calle 44 #71-12, Laureles");
      await page.waitForURL(/\/app\/rentals\/listings/, { timeout: 60_000 });

      const { data: profile, error: profileError } = await admin
        .from("landlord_profiles")
        .select("id")
        .eq("user_id", identity.userId)
        .single();
      if (profileError || !profile) throw new Error(`no landlord profile: ${profileError?.message}`);
      const profileId: string = profile.id;
      landlordProfileId = profileId;

      const draft = await readNewestDraft(admin, profileId);
      apartmentId = draft.id;
      expect(draft.listing_workflow_status).toBe("draft");
      const firstMetadata = (draft.metadata ?? {}) as Record<string, unknown>;
      expect(firstMetadata.place_id).toBeUndefined();
      expect(firstMetadata.formatted_address).toBeUndefined();
      expect(firstMetadata.address_source).toBeUndefined();

      // 2. Seed provenance the way a fixture, an admin edit or the material-edit
      //    guard would have left it, plus stale place keys from an earlier pick.
      const seeded = {
        ...firstMetadata,
        place_id: "ChIJsan1688seed",
        formatted_address: "Old selected address",
        address_source: "places_search",
        inventory_kind: "test_fixture",
        is_test_fixture: true,
        review_required_reason: "material edit after publication",
        review_required_at: "2026-11-19T00:00:00.000Z",
      };
      const { error: seedError } = await admin
        .from("apartments")
        .update({ metadata: seeded })
        .eq("id", apartmentId);
      if (seedError) throw new Error(`seed failed: ${seedError.message}`);

      // 3. The same broker saves again with a different free-text address. The RPC
      //    reuses the draft; the save must succeed under the provenance trigger and
      //    keep the seeded provenance.
      await page.goto("/app/rentals/onboarding", { waitUntil: "domcontentloaded" });
      await saveOnboarding(page, "Carrera 70 #44-12, Laureles");
      await page.waitForURL(/\/app\/rentals\/listings/, { timeout: 60_000 });

      const { data: saved, error: savedError } = await admin
        .from("apartments")
        .select("id, address, metadata, latitude, longitude")
        .eq("id", apartmentId)
        .single();
      if (savedError || !saved) throw new Error(`read back failed: ${savedError?.message}`);

      expect(saved.address).toBe("Carrera 70 #44-12, Laureles");
      expect(saved.latitude).toBeNull();
      expect(saved.longitude).toBeNull();

      const metadata = (saved.metadata ?? {}) as Record<string, unknown>;
      expect(metadata.inventory_kind).toBe("test_fixture");
      expect(metadata.is_test_fixture).toBe(true);
      expect(metadata.review_required_reason).toBe("material edit after publication");
      expect(metadata.review_required_at).toBe("2026-11-19T00:00:00.000Z");
      expect(metadata.place_id).toBeUndefined();
      expect(metadata.formatted_address).toBeUndefined();
      expect(metadata.address_source).toBeUndefined();

      // 4. Select a REAL Google Places result, not a fabricated ID. Saving the
      // reused draft must preserve all non-place metadata through the live DB
      // provenance trigger while replacing only the address-owned keys.
      await page.goto("/app/rentals/onboarding", { waitUntil: "domcontentloaded" });
      const selectedPlaceId = await saveOnboarding(
        page,
        "Calle 44 Laureles Medellín, Antioquia, Colombia",
        true,
      );
      expect(selectedPlaceId).toBeTruthy();
      await page.waitForURL(/\/app\/rentals\/listings/, { timeout: 60_000 });

      const { data: selected, error: selectedError } = await admin
        .from("apartments")
        .select("id, metadata")
        .eq("id", apartmentId)
        .single();
      if (selectedError || !selected) throw new Error(`selected-place readback failed: ${selectedError?.message}`);
      expect(selected.id).toBe(apartmentId);
      const selectedMetadata = (selected.metadata ?? {}) as Record<string, unknown>;
      expect(selectedMetadata.inventory_kind).toBe("test_fixture");
      expect(selectedMetadata.is_test_fixture).toBe(true);
      expect(selectedMetadata.review_required_reason).toBe("material edit after publication");
      expect(selectedMetadata.review_required_at).toBe("2026-11-19T00:00:00.000Z");
      expect(selectedMetadata.place_id).toBe(selectedPlaceId);
      expect(typeof selectedMetadata.formatted_address).toBe("string");
      expect(selectedMetadata.address_source).toBe("places_search");

      await page.screenshot({
        path: testInfo.outputPath("san-1688-draft-metadata-preserved.png"),
        fullPage: true,
      });
    } finally {
      await cleanup(admin, identity, landlordProfileId, apartmentId);
    }
  });
});

async function saveOnboarding(
  page: import("@playwright/test").Page,
  address: string,
  selectGooglePlace = false,
): Promise<string | null> {
  await expect(page.locator('[data-testid="rentals-onboarding"]')).toBeVisible();
  await page.addStyleTag({ content: "#cpk-web-inspector { display: none !important; }" });

  // Pre-hydration interactions are discarded, so drive step 1 until React enables it.
  const profileContinue = page
    .locator('[data-testid="ro-step-profile"]')
    .getByRole("button", { name: /Continue/ });
  const laureles = page.getByRole("button", { name: "Laureles", exact: true });
  await expect
    .poll(
      async () => {
        await page.locator("#ro-display-name").fill("QA Metadata Broker").catch(() => undefined);
        const classes = (await laureles.getAttribute("class")) ?? "";
        if (!classes.includes("bg-primary")) {
          await laureles.click({ timeout: 2_000 }).catch(() => undefined);
        }
        return profileContinue.isEnabled();
      },
      { timeout: 30_000, intervals: [250, 500, 1_000, 2_000] },
    )
    .toBe(true);
  await profileContinue.click({ timeout: 15_000 });

  await expect(page.locator('[data-testid="ro-step-listing"]')).toBeVisible();
  let selectedPlaceId: string | null = null;
  if (selectGooglePlace) {
    // Use actual authenticated Places results; do not fake a place ID or
    // shortcut the server's verification step.
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/places/search?q=") && response.status() === 200,
      { timeout: 30_000 },
    );
    await page.locator("#ro-address").fill(address);
    const response = await responsePromise;
    const payload = (await response.json()) as { results?: Array<{ placeId: string }> };
    expect(payload.results?.length).toBeGreaterThan(0);
    selectedPlaceId = payload.results?.[0]?.placeId ?? null;
    expect(selectedPlaceId).toBeTruthy();
    await expect(page.getByTestId("ro-address-option").first()).toBeVisible();
    await page.getByTestId("ro-address-option").first().click();
  } else {
    await page.locator("#ro-address").fill(address);
  }
  await page.locator("#ro-bedrooms").fill("2");
  await page.locator("#ro-bathrooms").fill("1");
  await page.locator("#ro-rent").fill("2400000");
  await page
    .locator('[data-testid="ro-step-listing"]')
    .getByRole("button", { name: /Continue/ })
    .click({ timeout: 15_000 });

  await expect(page.locator('[data-testid="ro-step-review"]')).toBeVisible();
  await page.getByTestId("ro-submit").click({ timeout: 15_000 });
  return selectedPlaceId;
}

async function readNewestDraft(admin: SupabaseClient, landlordProfileId: string) {
  const { data, error } = await admin
    .from("apartments")
    .select("id, metadata, listing_workflow_status")
    .eq("landlord_id", landlordProfileId)
    .eq("listing_workflow_status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`draft lookup failed: ${error?.message}`);
  return data;
}

async function cleanup(
  admin: SupabaseClient,
  identity: ThrowawayIdentity,
  landlordProfileId: string | undefined,
  apartmentId: string | undefined,
) {
  const failures: string[] = [];

  if (landlordProfileId) {
    const { error } = await admin.from("apartments").delete().eq("landlord_id", landlordProfileId);
    if (error) failures.push(`delete apartments: ${error.message}`);
  } else if (apartmentId) {
    const { error } = await admin.from("apartments").delete().eq("id", apartmentId);
    if (error) failures.push(`delete apartment: ${error.message}`);
  }

  if (landlordProfileId) {
    const { error } = await admin.from("landlord_profiles").delete().eq("id", landlordProfileId);
    if (error) failures.push(`delete profile: ${error.message}`);
  }

  // Re-query before deleting the identity so a leaked row is reported, not hidden.
  if (apartmentId) {
    const { data, error } = await admin.from("apartments").select("id").eq("id", apartmentId);
    if (error) failures.push(`verify apartments: ${error.message}`);
    else if ((data ?? []).length > 0) failures.push(`apartment ${apartmentId} still exists`);
  }
  if (landlordProfileId) {
    const { data, error } = await admin
      .from("landlord_profiles")
      .select("id")
      .eq("id", landlordProfileId);
    if (error) failures.push(`verify profile: ${error.message}`);
    else if ((data ?? []).length > 0) failures.push(`profile ${landlordProfileId} still exists`);
  }

  try {
    await deleteThrowawayIdentity(identity);
  } catch (error) {
    failures.push(`delete identity: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (failures.length > 0) throw new Error(`SAN-1688 cleanup failed: ${failures.join("; ")}`);
}
