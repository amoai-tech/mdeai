import { describe, expect, it } from "vitest";
import { shouldReportConciergeProviderError } from "@/lib/concierge-error-policy";

describe("shouldReportConciergeProviderError", () => {
  it("suppresses the anonymous runtime 401 probe", () => {
    expect(shouldReportConciergeProviderError(false, false)).toBe(false);
  });

  it("does not report while the session is still resolving", () => {
    expect(shouldReportConciergeProviderError(true, true)).toBe(false);
    expect(shouldReportConciergeProviderError(false, true)).toBe(false);
  });

  it("reports genuine failures for a verified signed-in session", () => {
    expect(shouldReportConciergeProviderError(true, false)).toBe(true);
  });
});
