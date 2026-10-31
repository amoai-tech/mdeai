import {
  test as base,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import type { Session } from "@supabase/supabase-js";
import {
  getTestSession,
  injectSession,
  QA_HOST_EMAIL,
  QA_SUPER_ADMIN_EMAIL,
  signInAsOnOrigin,
} from "./helpers/auth";

type AuthStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

type SharedFixtures = {
  authenticatedPage: Page;
  /** Opt-in, per-test Super Admin browser context; never authenticates anonymous tests. */
  superAdminPage: Page;
};

type SharedWorkerFixtures = {
  authSession: Session;
  authStorageState: AuthStorageState;
};

/**
 * The three values are built-in Playwright 1.61 WORKER option fixtures
 * (see node_modules/playwright/lib/index.js), so the resolved test.use()
 * values are injectable and can be checked before privileged login.
 */
export function assertSuperAdminRecordingOff(
  screenshot: unknown,
  trace: unknown,
  video: unknown,
): void {
  if (screenshot !== "off" || trace !== "off" || video !== "off") {
    throw new Error('Super Admin QA requires test.use({ screenshot: "off", trace: "off", video: "off" })');
  }
}

export const test = base.extend<SharedFixtures, SharedWorkerFixtures>({
  authSession: [
    async ({}, runFixture) => runFixture(await getTestSession(QA_HOST_EMAIL)),
    { scope: "worker" },
  ],
  authStorageState: [
    async ({ browser, authSession }, runFixture) => {
      const context = await browser.newContext({ storageState: undefined });
      try {
        await injectSession(context, authSession);
        await runFixture(await context.storageState());
      } finally {
        await context.close();
      }
    },
    { scope: "worker" },
  ],
  authenticatedPage: async (
    { page, context, authStorageState },
    runFixture,
  ) => {
    await context.setStorageState(authStorageState);
    await runFixture(page);
  },
  superAdminPage: async ({ browser, contextOptions, baseURL, screenshot, trace, video }, runFixture) => {
    // The real Playwright worker options are resolved before any admin session.
    assertSuperAdminRecordingOff(screenshot, trace, video);
    if (!baseURL) {
      throw new Error("Super Admin QA requires a Playwright baseURL");
    }
    // Separate context: the ordinary `page` fixture stays signed out even in this test.
    const context = await browser.newContext({
      ...contextOptions,
      baseURL,
      storageState: undefined,
    });
    try {
      const page = await context.newPage();
      const session = await signInAsOnOrigin(page, baseURL, QA_SUPER_ADMIN_EMAIL);
      if (session.user.email?.toLowerCase() !== QA_SUPER_ADMIN_EMAIL) {
        throw new Error("Super Admin QA session identity mismatch");
      }
      await runFixture(page);
    } finally {
      await context.close();
    }
  },
});

export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";
