import { randomUUID } from "node:crypto";
import { expect, request, test } from "@playwright/test";

import {
  createThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
} from "../helpers/auth";
import { cleanupFixtures } from "../helpers/partner-fixtures";

// This is an opt-in real-source + real-Supabase smoke test; provider implementation can vary. Keep it out of
// ordinary PR and deterministic browser suites; run only with explicit opt-in.
// Never capture authenticated screenshots, traces, or response bodies as CI
// artifacts. The existing deterministic partner signup test remains the PR gate.
test.skip(
  process.env.MDE_PARTNER_LIVE_SOURCE_E2E !== "1",
  "Real source smoke is opt-in: MDE_PARTNER_LIVE_SOURCE_E2E=1",
);
test.use({ trace: "off", screenshot: "off" });

test("SAN-1193: live website → source source → review/edit → save → refresh/readback", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  expect(
    hasE2eEnv(),
    "Real Supabase Auth + admin test credentials are required; do not skip to green",
  ).toBe(true);

  const origin = baseURL ?? "http://localhost:3001";
  const sourceUrl = "https://co.pergamino.co/pages/quienes-somos";
  const businessName = "QA Pergamino " + randomUUID().slice(0, 8);
  const admin = await getSupabaseAdmin();
  const actor = await createThrowawayIdentity("san1193-live-source");
  const createdIds: string[] = [];

  try {
    const guest = await request.newContext();
    try {
      const denied = await guest.post(
        new URL("/api/partners/onboarding/url-draft", origin).toString(),
        { data: { url: sourceUrl } },
      );
      expect(denied.status(), "Anonymous URL extraction must be denied").toBe(401);
    } finally {
      await guest.dispose();
    }

    await signInAsOnOrigin(page, origin, actor.email);
    await page.goto("/partners/signup?type=venue", { waitUntil: "load" });
    await expect(page.getByTestId("partner-signup-assistant")).toBeVisible();
    await page.getByLabel("Category", { exact: true }).fill("Café");

    const urlInput = page.getByTestId("business-url-input");
    const analyze = page.getByTestId("business-url-submit");
    // App Router hydration can lag behind visible HTML. Wait for the real
    // controlled input state instead of adding a fixed sleep.
    await expect(async () => {
      await urlInput.fill("");
      await urlInput.fill(sourceUrl);
      await expect(analyze).toBeEnabled({ timeout: 1200 });
    }).toPass({ timeout: 12_000, intervals: [250, 500, 1000] });

    const waiting = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/partners/onboarding/url-draft" &&
        response.request().method() === "POST",
      { timeout: 110_000 },
    );
    await analyze.click();
    const extraction = await waiting;
    expect(extraction.status(), "Actual source extraction must succeed").toBe(200);
    const provider = (await extraction.json()) as {
      success?: boolean;
      draft?: {
        businessName?: string;
        description?: string;
        sources?: string[];
      };
    };
    expect(provider.success).toBe(true);
    expect(provider.draft?.businessName?.toLowerCase()).toContain("pergamino");
    expect(provider.draft?.sources?.some((source) => {
      try {
        return new URL(source).hostname === "co.pergamino.co";
      } catch {
        return false;
      }
    }), "Only successfully retrieved Pergamino source is evidence").toBe(true);

    // The model must never write the database. Exercise the *actual* review
    // card and edit the final form with an unmistakably synthetic QA name.
    await expect(page.getByTestId("onboarding-suggestion-card")).toBeVisible();
    await page.getByTestId("onboarding-suggestion-edit").click();
    await page.getByTestId("suggestion-edit-businessName").fill(businessName);
    await page.getByTestId("suggestion-edit-website").fill(sourceUrl);
    await page.getByTestId("onboarding-suggestion-save").click();

    await expect(page.getByLabel("Business name", { exact: true })).toHaveValue(businessName);
    await expect(page.getByTestId("onboarding-suggestion-card")).toHaveCount(0);
    await expect(page.getByLabel("Website", { exact: true })).toHaveValue(sourceUrl);

    const saveResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/partners/activate" &&
        response.request().method() === "POST",
    );
    await page.getByTestId("partner-signup-submit").click();
    const saved = await saveResponse;
    expect(saved.status()).toBe(201);
    const saveResult = (await saved.json()) as { partnerId?: string };
    expect(saveResult.partnerId).toBeTruthy();
    const partnerId = saveResult.partnerId!;
    createdIds.push(partnerId);

    const readBack = async () => {
      const { data, error } = await admin
        .from("partners")
        .select("settings")
        .eq("id", partnerId)
        .single();
      expect(error, error?.message).toBeNull();
      expect(data?.settings).toMatchObject({
        businessName,
        website: sourceUrl,
      });
      if (provider.draft?.description) {
        expect(data?.settings).toMatchObject({
          description: provider.draft.description,
        });
      }
    };
    await readBack();
    await page.reload({ waitUntil: "load" });
    await readBack();

    const owned = await admin
      .from("partners")
      .select("id")
      .eq("profile_id", actor.userId)
      .eq("type", "venue");
    expect(owned.error).toBeNull();
    expect(owned.data).toHaveLength(1);
    const members = await admin
      .from("partner_members")
      .select("partner_id")
      .eq("profile_id", actor.userId)
      .eq("partner_id", partnerId);
    expect(members.error).toBeNull();
    expect(members.data).toHaveLength(1);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    console.log("SAN1193_LIVE_PASS", JSON.stringify({
      extraction: extraction.status(),
      save: saved.status(),
      sourceConfirmed: true,
      reviewedEditsPersisted: true,
      refreshReadback: true,
      noDuplicatePartnerOrMembership: true,
      mobile390: true,
    }));
  } finally {
    // A timeout can still commit. Discover any actor-owned partner, clean it,
    // and prove the identity + rows are gone, even when an assertion fails.
    const owned = await admin.from("partners").select("id").eq("profile_id", actor.userId);
    const ids = [...new Set([...createdIds, ...(owned.data ?? []).map((row) => row.id)])];
    try {
      await cleanupFixtures(admin, ids, [actor]);
    } finally {
      expect(owned.error, "Fixture discovery must not silently fail").toBeNull();
    }
    console.log("SAN1193_LIVE_CLEANUP_VERIFIED");
  }
});
