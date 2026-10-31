import { existsSync } from "node:fs";
import { expect, test } from "./fixtures";
import { hasE2eEnv } from "./helpers/auth";

/** These tests touch the real hosted Supabase user identities, but never write app records. */
test.use({ screenshot: "off", trace: "off", video: "off" });
test.describe("MDE role-selected, isolated QA sessions", () => {
  test.skip(process.env.MDE_ROLE_QA_E2E !== "1", "Opt-in trusted QA runner only");
  test.beforeAll(() => {
    expect(hasE2eEnv(), "Existing Supabase QA credentials are needed").toBe(true);
  });

  test.describe("anonymous", () => {
    test.use({ qaRole: "anonymous" });
    test("an unsigned browser cannot read admin rental records", async ({ qaRolePage }) => {
      const response = await qaRolePage.request.get("/api/admin/rentals/test");
      expect(response.status()).toBe(401);
    });
  });

  test.describe("super-admin", () => {
    test.use({ qaRole: "super-admin" });
    test("selects the existing Super Admin and marks all reports as private", async ({ qaRolePage }, info) => {
      const response = await qaRolePage.goto("/admin/rentals");
      expect(response?.status()).toBe(200);
      await expect(qaRolePage.getByTestId("admin-rental-table")).toBeVisible();
      expect(existsSync(info.outputPath("mde-private-qa.marker"))).toBe(true);
    });
  });

  test.describe("event-host", () => {
    test.use({ qaRole: "event-host" });
    test("uses the pre-existing standard QA account for ordinary signed-in navigation", async ({ qaRolePage }) => {
      const response = await qaRolePage.goto("/saved");
      expect(response?.status()).toBe(200);
      await expect(qaRolePage.getByTestId("saved-page")).toBeVisible();
    });
  });

  test.describe("renter", () => {
    test.use({ qaRole: "renter" });
    test.skip(!process.env.MDE_QA_RENTER_EMAIL, "Configure an existing dedicated renter QA identity");
    test("renter signs in without using Super Admin", async ({ qaRolePage }) => {
      const response = await qaRolePage.goto("/saved");
      expect(response?.status()).toBe(200);
      await expect(qaRolePage.getByTestId("saved-page")).toBeVisible();
    });
  });

  test.describe("broker", () => {
    test.use({ qaRole: "broker" });
    test.skip(!process.env.MDE_QA_BROKER_EMAIL, "Configure an existing dedicated broker QA identity");
    test("broker reaches the existing rental workspace", async ({ qaRolePage }) => {
      const response = await qaRolePage.goto("/host/rentals");
      expect(response?.status()).toBe(200);
    });
  });
});
