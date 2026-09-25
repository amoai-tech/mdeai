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
      await injectSession(context, authSession);
      await runFixture(await context.storageState());
      await context.close();
    },
    { scope: "worker" },
  ],
  authenticatedPage: async ({ browser, authStorageState }, runFixture) => {
    const context = await browser.newContext({ storageState: authStorageState });
    const page = await context.newPage();
    await runFixture(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";
