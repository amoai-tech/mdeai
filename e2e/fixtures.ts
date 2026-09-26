import {
  test as base,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import type { Session } from "@supabase/supabase-js";
import { getTestSession, injectSession, QA_HOST_EMAIL } from "./helpers/auth";

type AuthStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

type SharedFixtures = {
  authenticatedPage: Page;
};

type SharedWorkerFixtures = {
  authSession: Session;
  authStorageState: AuthStorageState;
};

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
    { browser, authStorageState, baseURL, viewport },
    runFixture,
  ) => {
    const context = await browser.newContext({
      storageState: authStorageState,
      baseURL: baseURL ?? undefined,
      viewport,
    });
    try {
      await runFixture(await context.newPage());
    } finally {
      await context.close();
    }
  },
});

export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";
