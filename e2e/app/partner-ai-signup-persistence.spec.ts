import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import {
  createThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
} from "../helpers/auth";
import { cleanupFixtures } from "../helpers/partner-fixtures";

// This runs against real Supabase/Auth. It is explicitly opt-in and cleans up
// the exact throwaway identity and partner rows it creates.
test.skip(
  process.env.MDE_PARTNER_SIGNUP_E2E !== "1" || !hasE2eEnv(),
  "Requires MDE_PARTNER_SIGNUP_E2E=1 and authorized Supabase E2E credentials",
);
test.use({
  launchOptions: process.env.MDE_CHROME_BIN
    ? { executablePath: process.env.MDE_CHROME_BIN }
    : {},
});
test.describe.configure({ timeout: 120_000 });

/** Apply a source-backed proposal to the real controlled form, without saving. */
async function reviewWebsiteSuggestion(page: Page): Promise<string> {
  const name = "QA Café " + randomUUID().slice(0, 8);
  await page.getByLabel("Business name").fill(name);
  await page.getByLabel("Category", { exact: true }).fill("Cafe");
  await page.getByLabel("Neighborhood", { exact: true }).fill("Old value");

  // Only the external Gemini response is deterministic here.
  // The actual browser UI, activation endpoint, Auth and database are real.
  await page.route("**/api/partners/onboarding/url-draft", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        draft: {
          category: "Café from website",
          neighborhood: "Laureles",
          description: "Synthetic website description",
          sources: ["https://example.org/"],
        },
      }),
    }),
  );

  const input = page.getByTestId("business-url-input");
  const findDetails = page.getByTestId("business-url-submit");
  // App Router may show interactive HTML before React has attached the
  // controlled input handler. Retry filling until the real submit enables.
  await expect(async () => {
    await input.fill("");
    await input.fill("https://example.org/");
    await expect(findDetails).toBeEnabled({ timeout: 1200 });
  }).toPass({ timeout: 12_000, intervals: [250, 500, 1000] });

  await findDetails.click();
  await expect(page.getByTestId("onboarding-suggestion-card")).toBeVisible();
  await expect(page.getByLabel("Neighborhood", { exact: true })).toHaveValue(
    "Old value",
  );
  await page.getByTestId("onboarding-suggestion-accept").click();
  await expect(page.getByLabel("Neighborhood", { exact: true })).toHaveValue(
    "Laureles",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  ).toBe(false);
  await page.screenshot({
    path: "tmp/qa/san1193-rebased/accepted-390.png",
    fullPage: true,
  });
  return name;
}

test("website proposal needs acceptance; save and concurrent edits persist without duplicates", async ({
  page,
  baseURL,
}) => {
  const admin = await getSupabaseAdmin();
  const actor = await createThrowawayIdentity("mde-partner-signup-e2e");
  const createdIds: string[] = [];

  try {
    await signInAsOnOrigin(page, baseURL ?? "http://localhost:3099", actor.email);
    await page.goto("/partners/signup?type=venue", { waitUntil: "load" });
    await expect(page.getByTestId("partner-signup-assistant")).toBeVisible();

    const name = await reviewWebsiteSuggestion(page);

    const waitForSave = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/partners/activate" &&
        response.request().method() === "POST",
    );
    await page.getByTestId("partner-signup-submit").click();
    const response = await waitForSave;
    const payload = (await response.json()) as { partnerId?: string };
    expect(response.status()).toBe(201);
    const partnerId = payload.partnerId ?? "";
    expect(partnerId).not.toBe("");
    createdIds.push(partnerId);

    const created = await admin
      .from("partners")
      .select("settings")
      .eq("id", partnerId)
      .single();
    expect(created.error).toBeNull();
    expect(created.data?.settings).toMatchObject({
      businessName: name,
      category: "Café from website",
      neighborhood: "Laureles",
      description: "Synthetic website description",
    });

    const [description, neighborhood] = await Promise.all([
      page.request.post("/api/partners/activate", {
        data: { type: "venue", settings: { description: "Updated description" } },
      }),
      page.request.post("/api/partners/activate", {
        data: { type: "venue", settings: { neighborhood: "El Poblado" } },
      }),
    ]);
    expect([description.status(), neighborhood.status()]).toEqual([200, 200]);

    const final = await admin
      .from("partners")
      .select("settings")
      .eq("id", partnerId)
      .single();
    expect(final.error).toBeNull();
    expect(final.data?.settings).toMatchObject({
      businessName: name,
      category: "Café from website",
      description: "Updated description",
      neighborhood: "El Poblado",
    });

    const partners = await admin
      .from("partners")
      .select("id")
      .eq("profile_id", actor.userId)
      .eq("type", "venue");
    expect(partners.error).toBeNull();
    expect(partners.data).toHaveLength(1);
    const members = await admin
      .from("partner_members")
      .select("partner_id")
      .eq("profile_id", actor.userId)
      .eq("partner_id", partnerId);
    expect(members.error).toBeNull();
    expect(members.data).toHaveLength(1);

    console.log("PARTNER_REAL_DB_PROOF", JSON.stringify({
      created: response.status(),
      retries: [description.status(), neighborhood.status()],
      bothConcurrentFields: true,
      noDuplicatePartnerOrMembership: true,
      mobile390: true,
    }));
  } finally {
    // If a response fails after a successful insert, still discover and remove
    // the exact actor-owned rows instead of leaking synthetic production data.
    const owned = await admin.from("partners").select("id").eq("profile_id", actor.userId);
    const ids = [...new Set([...createdIds, ...(owned.data ?? []).map((row) => row.id)])];
    await cleanupFixtures(admin, ids, [actor]);
    expect(owned.error, "QA cleanup ownership read failed").toBeNull();
    console.log("PARTNER_QA_CLEANUP VERIFIED");
  }
});
