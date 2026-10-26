import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type Request as PWRequest,
  type Response as PWResponse,
} from "@playwright/test";
import {
  createThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "../helpers/auth";
import {
  cleanupFixtures,
  createPartner,
  type Admin,
} from "../helpers/partner-fixtures";

const QA_DIR = "tmp/qa/san-1579";

/**
 * SAN-1579 — the partner business profile inside the authenticated /app shell.
 *
 * Fixtures are throwaway identities plus real partner rows created through the
 * service-role client. Every test deletes what it made and then re-reads the
 * database to prove the rows are gone, including on failure.
 */
test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
});

// The seeded multi-business journey mints real sessions and writes real rows;
// give the Supabase round-trips room without hiding a genuine hang.
test.describe.configure({ timeout: 180_000 });

async function openDescription(page: Page, value: string) {
  const description = page.getByTestId("profile-description");
  await description.focus();
  await description.fill(value);
  return description;
}

async function assertSaveRequest(
  page: Page,
  requestPromise: Promise<PWRequest>,
  responsePromise: Promise<PWResponse>,
  norteId: string,
  nextDescription: string,
) {
await page.keyboard.press("Enter");

const request = await requestPromise;
// Only the edited field is sent, with the selection as a selector.
expect(request.postDataJSON()).toEqual({
  partnerId: norteId,
  description: nextDescription,
});
const response = await responsePromise;
expect(response.status()).toBe(200);
await expect(page.getByTestId("partner-profile-saved")).toBeVisible();
// The form must be usable again after a successful save, not stuck saving.
await expect(page.getByTestId("profile-business-name")).toBeEnabled();
await page.screenshot({
  path: path.join(QA_DIR, "partners-saved-1440.png"),
  fullPage: true,
});

}

async function verifyPersisted(
  page: Page,
  admin: Admin,
  partnerIds: string[],
  norteId: string,
  surId: string,
  nextDescription: string,
) {
// Refresh proves the visible value came from the database.
await page.reload();
await expect(page.getByTestId("profile-description")).toHaveValue(
  nextDescription,
);
await expect(
  page.getByRole("heading", { level: 1, name: "Café Norte" }),
).toBeVisible();

const stored = await admin
  .from("partners")
  .select("id, settings")
  .in("id", partnerIds);
expect(stored.error, stored.error?.message).toBeNull();
const settingsById = new Map(
  (stored.data ?? []).map((row) => [
    row.id,
    row.settings as Record<string, unknown>,
  ]),
);
expect(settingsById.get(norteId)).toMatchObject({
  businessName: "Café Norte",
  description: nextDescription,
});
// The other business is untouched, still in the database, still reachable.
expect(settingsById.get(surId)).toMatchObject({
  businessName: "Café Sur",
  description: "Sur original",
});

await page.goto(`/app/partners/profile?partner=${surId}`);
await expect(
  page.getByRole("heading", { level: 1, name: "Café Sur" }),
).toBeVisible();
await expect(page.getByTestId("profile-description")).toHaveValue(
  "Sur original",
);
await expect(page.getByRole("link", { name: "Café Sur" })).toHaveAttribute(
  "aria-current",
  "page",
);

}

async function verifyLegacyAndFailure(
  page: Page,
  admin: Admin,
  norteId: string,
  nextDescription: string,
) {
// Legacy /partners/profile still works and shares the same body.
await page.goto(`/partners/profile?partner=${norteId}`);
await expect(page.getByTestId("partner-profile")).toBeVisible();
await expect(page.locator("main")).toHaveCount(1);
await expect(
  page.getByRole("heading", { level: 1, name: "Café Norte" }),
).toBeVisible();
await expect(page.getByTestId("profile-description")).toHaveValue(
  nextDescription,
);
await expect(page.getByTestId("partner-profile-form")).toBeVisible();
await page.screenshot({
  path: path.join(QA_DIR, "partners-legacy-1440.png"),
  fullPage: true,
});

// A failed save must show a real error, keep the edit and change nothing.
await page.goto(`/app/partners/profile?partner=${norteId}`);
let intercepted = 0;
await page.route("**/api/partners/profile", async (route) => {
  if (route.request().method() === "PATCH") {
    intercepted += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { message: "Could not save your profile" },
      }),
    });
    return;
  }
  await route.continue();
});
const failedValue = "Norte unsaved edit";
await openDescription(page, failedValue);
await page.getByTestId("partner-profile-save").click();
await expect(page.getByTestId("partner-profile-error")).toBeVisible();
await expect(page.getByTestId("partner-profile-error")).toContainText(
  "Could not save your profile",
);
await expect(page.getByTestId("partner-profile-saved")).toHaveCount(0);
await expect(page.getByTestId("profile-description")).toHaveValue(
  failedValue,
);
await expect(page.getByTestId("partner-profile-save")).toBeEnabled();
expect(intercepted).toBe(1);
await page.unroute("**/api/partners/profile");

const afterFailure = await admin
  .from("partners")
  .select("settings")
  .eq("id", norteId)
  .single();
expect(
  (afterFailure.data?.settings as Record<string, unknown>).description,
).toBe(nextDescription);

}

async function verifyMobileAndRevocation(
  page: Page,
  admin: Admin,
  ana: ThrowawayIdentity,
  norteId: string,
  nextDescription: string,
) {
const chooser = page.getByRole("navigation", {
  name: "Choose your business",
});
// 390px: same screen, no horizontal overflow, wrapping chips, 44px targets.
await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await expect(page.getByTestId("partner-profile-form")).toBeVisible();
await expect(page.getByTestId("partner-profile-save")).toBeVisible();
await expect(page.locator("main")).toHaveCount(1);
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
expect(overflow).toBe(false);
const chooserBox = await chooser.boundingBox();
expect(chooserBox).not.toBeNull();
if (!chooserBox) throw new Error("business chooser is not visible");
expect(chooserBox.width).toBeLessThanOrEqual(390);
expect(
  await chooser.evaluate(
    (element) => getComputedStyle(element).flexWrap,
  ),
).toBe("wrap");
const undersized = await page.evaluate(() =>
  [
    ...document.querySelectorAll(
      '[data-testid="partner-profile-form"] input, [data-testid="partner-profile-form"] textarea, [data-testid="partner-profile-save"]',
    ),
  ]
    .filter((element) => element.getBoundingClientRect().height < 44)
    .map((element) => element.getAttribute("data-testid") ?? "field"),
);
expect(undersized).toEqual([]);
await page.screenshot({
  path: path.join(QA_DIR, "partners-390.png"),
  fullPage: true,
});

// Revoking every membership leaves an honest empty state, not stolen data.
const revoked = await admin
  .from("partner_members")
  .delete()
  .eq("profile_id", ana.userId);
expect(revoked.error, revoked.error?.message).toBeNull();

await page.goto("/app/partners/profile");
await expect(page.getByTestId("partner-profile-missing")).toBeVisible();
await expect(page.getByTestId("partner-profile-form")).toHaveCount(0);
await expect(page.getByText("Café Norte")).toHaveCount(0);
await expect(page.getByText("Café Sur")).toHaveCount(0);

await page.goto("/partners/profile");
await expect(page.getByTestId("partner-profile-missing")).toBeVisible();

const denied = await page.request.patch("/api/partners/profile", {
  data: { partnerId: norteId, description: "revoked write" },
});
// The RPC re-checks the selector membership and denies a revoked one (403);
// without a selector the no-membership path is an honest 404 (Carlos test).
expect(denied.status()).toBe(403);

const afterRevoke = await admin
  .from("partners")
  .select("settings")
  .eq("id", norteId)
  .single();
expect(
  (afterRevoke.data?.settings as Record<string, unknown>).description,
).toBe(nextDescription);
}
async function runAnaJourney(browser: Browser, baseURL: string | undefined) {
  const origin = baseURL ?? "http://localhost:3001";
  const admin = await getSupabaseAdmin();
  const ana = await createThrowawayIdentity("san-1579-ana");
  const partnerIds: string[] = [];

  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  let tracing = false;

  try {
    const norteId = await createPartner(admin, ana.userId, "venue", {
      businessName: "Café Norte",
      category: "Café",
      neighborhood: "Laureles",
      description: "Norte original",
    });
    partnerIds.push(norteId);
    const surId = await createPartner(admin, ana.userId, "developer", {
      businessName: "Café Sur",
      category: "Café",
      neighborhood: "Poblado",
      description: "Sur original",
    });
    partnerIds.push(surId);

    await context.tracing.start({ screenshots: true, snapshots: true });
    tracing = true;
    await signInAsOnOrigin(page, origin, ana.email);

    // The Partners workspace destination now points at the /app adapter.
    await page.goto("/app");
    const partnersCard = page.getByTestId("workspace-card-partners");
    await expect(partnersCard).toBeVisible();
    await expect(partnersCard.getByRole("link", { name: /Open/ })).toHaveAttribute(
      "href",
      "/app/partners/profile",
    );
    await partnersCard.getByRole("link", { name: /Open/ }).click();
    await expect(page).toHaveURL(/\/app\/partners\/profile$/);
    await expect(page.getByTestId("workspace-switcher")).toContainText(
      "Partners",
    );
    await expect(page.getByTestId("app-partner-profile")).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);

    // Two real memberships require an explicit choice.
    const chooser = page.getByRole("navigation", {
      name: "Choose your business",
    });
    await expect(chooser).toBeVisible();
    await expect(chooser.getByRole("link", { name: "Café Norte" })).toBeVisible();
    await expect(chooser.getByRole("link", { name: "Café Sur" })).toBeVisible();
    await expect(
      page.getByText("Choose a business above to edit its profile."),
    ).toBeVisible();
    await expect(page.getByTestId("partner-profile-form")).toHaveCount(0);
    await page.screenshot({
      path: path.join(QA_DIR, "partners-selection-1440.png"),
      fullPage: true,
    });

    // Selecting with ?partner=<uuid> opens exactly that authorized business.
    await chooser.getByRole("link", { name: "Café Norte" }).click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/app/partners/profile" &&
        url.searchParams.get("partner") === norteId,
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "Café Norte" }),
    ).toBeVisible();
    await expect(chooser.getByRole("link", { name: "Café Norte" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("partner-profile-form")).toBeVisible();

    // Edit through the keyboard, then save with Enter on the focused button.
    const nextDescription = `Norte saved ${Date.now()}`;
    await openDescription(page, nextDescription);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("partner-profile-save")).toBeFocused();

    const requestPromise = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/partners/profile") &&
        request.method() === "PATCH",
    );
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/partners/profile") &&
        response.request().method() === "PATCH",
    );
    await assertSaveRequest(page, requestPromise, responsePromise, norteId, nextDescription);
    await verifyPersisted(page, admin, partnerIds, norteId, surId, nextDescription);
    await verifyLegacyAndFailure(page, admin, norteId, nextDescription);
    await verifyMobileAndRevocation(page, admin, ana, norteId, nextDescription);
  } finally {
    await finishAnaJourney(context, admin, partnerIds, ana, tracing);
  }
}

async function finishAnaJourney(
  context: BrowserContext,
  admin: Admin,
  partnerIds: string[],
  ana: ThrowawayIdentity,
  tracing: boolean,
) {
  if (tracing) {
    await context
      .tracing.stop({
        path: path.join(QA_DIR, "partners-journey-1440-trace.zip"),
      })
      .catch(() => {});
  }
  // Delete database fixtures before closing the context: a stalled navigation
  // must never be able to keep synthetic rows behind.
  try {
    await cleanupFixtures(admin, partnerIds, [ana]);
  } finally {
    await context.close();
  }
}

test.describe("SAN-1579 partner workspace", { tag: ["@app", "@partners"] }, () => {
  test.skip(!hasE2eEnv(), "Supabase e2e env is not configured");

  test("Ana selects, edits, saves and reloads one of two businesses", async ({
    browser,
    baseURL,
  }) => {
    await runAnaJourney(browser, baseURL);
  });

  test("Carlos cannot read or write Ana's business", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const admin = await getSupabaseAdmin();
    const ana = await createThrowawayIdentity("san-1579-ana-owner");
    const carlos = await createThrowawayIdentity("san-1579-carlos");
    const partnerIds: string[] = [];

    try {
      const anaPartnerId = await createPartner(admin, ana.userId, "venue", {
        businessName: "Ana Private Café",
        description: "Ana secret",
      });
      partnerIds.push(anaPartnerId);
      const carlosPartnerId = await createPartner(admin, carlos.userId, "venue", {
        businessName: "Carlos Café",
        description: "Carlos own",
      });
      partnerIds.push(carlosPartnerId);

      await signInAsOnOrigin(page, origin, carlos.email);

      // Foreign uuid: denied without leaking the business.
      await page.goto(`/app/partners/profile?partner=${anaPartnerId}`);
      await expect(page.getByTestId("partner-profile-load-error")).toBeVisible();
      await expect(page.getByTestId("partner-profile-load-error")).toContainText(
        "This business is not available for this account.",
      );
      await expect(page.getByText("Ana Private Café")).toHaveCount(0);
      await expect(page.getByText("Ana secret")).toHaveCount(0);
      await expect(page.getByTestId("partner-profile-form")).toHaveCount(0);
      await expect(page.locator("main")).toHaveCount(1);

      // Malformed and unknown ids are safe, not a crash or a data leak.
      await page.goto("/app/partners/profile?partner=not-a-uuid");
      await expect(page.getByTestId("partner-profile-load-error")).toBeVisible();
      await page.goto(`/app/partners/profile?partner=${randomUUID()}`);
      await expect(page.getByTestId("partner-profile-load-error")).toBeVisible();

      // A real membership of his own still loads normally.
      await page.goto(`/app/partners/profile?partner=${carlosPartnerId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Carlos Café" }),
      ).toBeVisible();

      // The writer re-checks membership: Carlos cannot PATCH Ana's partner.
      const denied = await page.request.patch("/api/partners/profile", {
        data: { partnerId: anaPartnerId, description: "stolen" },
      });
      expect(denied.status()).toBe(403);
      expect(await denied.json()).toMatchObject({ success: false });

      const malformed = await page.request.patch("/api/partners/profile", {
        data: { partnerId: "not-a-uuid", description: "x" },
      });
      expect(malformed.status()).toBe(400);

      const anaRow = await admin
        .from("partners")
        .select("settings")
        .eq("id", anaPartnerId)
        .single();
      expect(anaRow.data?.settings).toMatchObject({
        businessName: "Ana Private Café",
        description: "Ana secret",
      });

      // Revoked / no membership is an honest empty state, never a stale profile.
      const revoked = await admin
        .from("partner_members")
        .delete()
        .eq("profile_id", carlos.userId);
      expect(revoked.error, revoked.error?.message).toBeNull();

      await page.goto("/app/partners/profile");
      await expect(page.getByTestId("partner-profile-missing")).toBeVisible();
      await expect(page.getByText("Carlos Café")).toHaveCount(0);
      await expect(page.getByTestId("partner-profile-form")).toHaveCount(0);

      const gone = await page.request.patch("/api/partners/profile", {
        data: { description: "after revoke" },
      });
      expect(gone.status()).toBe(404);

      const remains = await admin
        .from("partners")
        .select("settings")
        .eq("id", carlosPartnerId)
        .single();
      expect(
        (remains.data?.settings as Record<string, unknown>).description,
      ).toBe("Carlos own");
    } finally {
      await cleanupFixtures(admin, partnerIds, [ana, carlos]);
    }
  });
});
