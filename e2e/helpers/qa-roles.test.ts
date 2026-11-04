import { describe, expect, it } from "vitest";
import { QA_SUPER_ADMIN_EMAIL } from "./auth";
import { resolveQaRoleEmail } from "./qa-roles";

describe("role-selected QA identities", () => {
  it("keeps anonymous browsers signed out", () => {
    expect(resolveQaRoleEmail("anonymous", {})).toBeNull();
  });
  it("uses the existing Super Admin only for admin intent", () => {
    expect(resolveQaRoleEmail("super-admin", {})).toBe(QA_SUPER_ADMIN_EMAIL);
  });
  it("requires a separately provisioned non-admin event host", () => {
    expect(() => resolveQaRoleEmail("event-host", {})).toThrow(/MDE_QA_EVENT_HOST_EMAIL/);
    expect(resolveQaRoleEmail("event-host", { MDE_QA_EVENT_HOST_EMAIL: "QA-Event-Host@MDEAI.CO" })).toBe("qa-event-host@mdeai.co");
    expect(() => resolveQaRoleEmail("event-host", { MDE_QA_EVENT_HOST_EMAIL: QA_SUPER_ADMIN_EMAIL })).toThrow(/dedicated/);
  });
  it.each(["renter", "broker"] as const)("rejects an unconfigured %s account", (role) => {
    expect(() => resolveQaRoleEmail(role, {})).toThrow(/existing dedicated account/);
  });
  it("uses an existing configured renter identity without privilege fallback", () => {
    expect(resolveQaRoleEmail("renter", { MDE_QA_RENTER_EMAIL: "QA-Renter@MDEAI.CO" })).toBe("qa-renter@mdeai.co");
  });
  it("uses an existing configured broker identity", () => {
    expect(resolveQaRoleEmail("broker", { MDE_QA_BROKER_EMAIL: "qa-broker@mdeai.co" })).toBe("qa-broker@mdeai.co");
  });
  it("refuses an unrelated real customer", () => {
    expect(() => resolveQaRoleEmail("renter", { MDE_QA_RENTER_EMAIL: "customer@example.com" })).toThrow(/dedicated/);
  });
  it("refuses Super Admin for broker tests", () => {
    expect(() => resolveQaRoleEmail("broker", { MDE_QA_BROKER_EMAIL: QA_SUPER_ADMIN_EMAIL })).toThrow(/dedicated/);
  });
});
