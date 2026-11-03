import { assertSuperAdminRecordingOff, expect, test } from "./fixtures";

/**
 * Hermetic Playwright 1.61 regression. These are built-in WORKER option
 * fixtures; test.use belongs at file scope, not inside a describe group.
 * No browser, login, Supabase credentials or external services needed.
 */
test.use({ screenshot: "off", trace: "off", video: "off" });

test("safe resolved options allow privileged fixture setup", async ({ screenshot, trace, video }) => {
  expect([screenshot, trace, video]).toEqual(["off", "off", "off"]);
  expect(() => assertSuperAdminRecordingOff(screenshot, trace, video)).not.toThrow();
});

test("missing options cannot bypass the guard", () => {
  expect(() => assertSuperAdminRecordingOff(undefined, undefined, undefined)).toThrow(/Super Admin QA requires/);
});

test("each recording mode individually blocks privileged login", () => {
  expect(() => assertSuperAdminRecordingOff("only-on-failure", "off", "off")).toThrow(/Super Admin QA requires/);
  expect(() => assertSuperAdminRecordingOff("off", "on-first-retry", "off")).toThrow(/Super Admin QA requires/);
  expect(() => assertSuperAdminRecordingOff("off", "off", "on-first-retry")).toThrow(/Super Admin QA requires/);
});
