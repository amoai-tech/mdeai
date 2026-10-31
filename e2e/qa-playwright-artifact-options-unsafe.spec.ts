import { assertSuperAdminRecordingOff, expect, test } from "./fixtures";

/** Real unsafe Playwright options, resolved by runner from file-level test.use. */
test.use({ screenshot: "only-on-failure", trace: "on-first-retry", video: "on-first-retry" });

test("unsafe runtime options are injectable and rejected by the privileged fixture guard", async ({ screenshot, trace, video }) => {
  expect([screenshot, trace, video]).toEqual(["only-on-failure", "on-first-retry", "on-first-retry"]);
  expect(() => assertSuperAdminRecordingOff(screenshot, trace, video)).toThrow(/Super Admin QA requires/);
});
