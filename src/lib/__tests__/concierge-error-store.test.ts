import { beforeEach, describe, expect, it } from "vitest";
import {
  clearConciergeError,
  getConciergeErrorForThread,
  isExpectedGuestStartup401,
  getConciergeErrorSnapshot,
  reportConciergeError,
} from "@/lib/concierge-error-store";

beforeEach(() => clearConciergeError());

describe("concierge error ownership", () => {
  it("records the conversation that failed", () => {
    reportConciergeError("thread-a");
    expect(getConciergeErrorSnapshot()).toMatchObject({ version: 1, threadId: "thread-a" });
  });

  it("does not clear another conversation's error", () => {
    reportConciergeError("thread-a");
    clearConciergeError("thread-b");
    expect(getConciergeErrorSnapshot()).toMatchObject({ version: 1, threadId: "thread-a" });
  });

  it("clears the matching conversation's error", () => {
    reportConciergeError("thread-a");
    clearConciergeError("thread-a");
    expect(getConciergeErrorSnapshot()).toEqual({ version: 0, threadId: null });
  });

  it("never overwrites a newer conversation's notice with a late old error", () => {
    reportConciergeError("thread-b");
    reportConciergeError("thread-a");
    expect(getConciergeErrorForThread("thread-b")).toMatchObject({ threadId: "thread-b" });
    expect(getConciergeErrorForThread("thread-a")).toMatchObject({ threadId: "thread-a" });
  });

  it("clears only the named conversation", () => {
    reportConciergeError("thread-a");
    reportConciergeError("thread-b");
    clearConciergeError("thread-a");
    expect(getConciergeErrorForThread("thread-a").version).toBe(0);
    expect(getConciergeErrorForThread("thread-b")).toMatchObject({ threadId: "thread-b" });
  });

  it("never shows a legacy unscoped error in a named conversation", () => {
    reportConciergeError({ retry: () => {} });
    expect(getConciergeErrorForThread("thread-b")).toEqual({ version: 0, threadId: null });
    expect(getConciergeErrorForThread()).toMatchObject({ version: 1, threadId: null });
  });

  it("keeps legacy no-thread reports visible", () => {
    reportConciergeError();
    expect(getConciergeErrorSnapshot()).toMatchObject({ version: 1, threadId: null });
  });
});

describe("guest startup authorization classification", () => {
  const probe401 = { code: "runtime_info_fetch_failed", context: { runtimeStatus: 401, reason: "answered" } };

  it("ignores only the guest runtime-info 401, not a signed-in 401", () => {
    expect(isExpectedGuestStartup401(probe401, false)).toBe(true);
    expect(isExpectedGuestStartup401({
      code: "runtime_info_fetch_failed",
      context: { runtimeUrl: "/api/copilotkit" },
      error: { runtimeInfoStatus: 401, message: "Runtime info request failed with status 401" },
    }, false)).toBe(true);
    expect(isExpectedGuestStartup401(probe401, true)).toBe(false);
  });

  it("retains real run/auth/network failures and unknown error shapes", () => {
    expect(isExpectedGuestStartup401({ code: "agent_run_failed", context: { runtimeStatus: 401 } }, false)).toBe(false);
    expect(isExpectedGuestStartup401({ code: "runtime_info_fetch_failed", context: { runtimeStatus: 500 } }, false)).toBe(false);
    expect(isExpectedGuestStartup401({ code: "runtime_info_fetch_failed", context: { reason: "no-answer" } }, false)).toBe(false);
    expect(isExpectedGuestStartup401({ message: "unauthorized" }, false)).toBe(false);
    expect(isExpectedGuestStartup401(undefined, false)).toBe(false);
  });

  it("preserves conversation-scoped error reporting for real failures", () => {
    reportConciergeError({ threadId: "thread-a", retry: () => {} });
    expect(getConciergeErrorForThread("thread-a")).toMatchObject({ version: 1, threadId: "thread-a" });
    expect(getConciergeErrorForThread("thread-b").version).toBe(0);
  });
});
