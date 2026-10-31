import {
  test as base,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { writeFileSync } from "node:fs";
import { resolveQaRoleEmail, type QaRole } from "./helpers/qa-roles";
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
  /** Explicit role intent chooses the existing QA identity; default is anonymous. */
  qaRole: QaRole;
  qaRolePage: Page;
  /** Opt-in, per-test Super Admin browser context; never authenticates anonymous tests. */
  superAdminPage: Page;
};

type SharedWorkerFixtures = {
  authSession: Session;
  authStorageState: AuthStorageState;
};

/** Mark protected reports so CI removes them before uploading any artifacts. */
function markPrivateQaOutput(outputPath: (file: string) => string): void {
  writeFileSync(outputPath("mde-private-qa.marker"), "PRIVATE_QA_ARTIFACTS\n");
}

function requireNoRecording(screenshot: unknown, trace: unknown, video: unknown): void {
  if (screenshot !== "off" || trace !== "off" || video !== "off") {
    throw new Error('Authenticated QA requires test.use({ screenshot: "off", trace: "off", video: "off" })');
  }
}

export const test = base.extend<SharedFixtures, SharedWorkerFixtures>({
  qaRole: ["anonymous", { option: true }],
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
    testInfo,
  ) => {
    // Preserve the legacy signed-in fixture contract; flag reports for safe CI removal.
    markPrivateQaOutput((name) => testInfo.outputPath(name));
    await context.setStorageState(authStorageState);
    await runFixture(page);
  },
  qaRolePage: async (
    { browser, contextOptions, baseURL, qaRole, screenshot, trace, video },
    runFixture,
    testInfo,
  ) => {
    const email = resolveQaRoleEmail(qaRole);
    if (email) {
      requireNoRecording(screenshot, trace, video);
      markPrivateQaOutput((name) => testInfo.outputPath(name));
    }
    if (!baseURL) throw new Error("QA role fixture requires a Playwright baseURL");
    const context = await browser.newContext({
      ...contextOptions,
      baseURL,
      storageState: undefined,
    });
    try {
      const page = await context.newPage();
      if (email) {
        const session = await signInAsOnOrigin(page, baseURL, email, { requireExisting: true });
        if (session.user.email?.toLowerCase() !== email.toLowerCase()) {
          throw new Error("QA role session identity mismatch");
        }
      }
      await runFixture(page);
    } finally {
      await context.close();
    }
  },
  superAdminPage: async ({ browser, contextOptions, baseURL, screenshot, trace, video }, runFixture, testInfo) => {
    requireNoRecording(screenshot, trace, video);
    markPrivateQaOutput((name) => testInfo.outputPath(name));
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
