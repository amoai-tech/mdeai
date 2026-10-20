import { beforeEach, describe, expect, it } from "vitest";
import {
  clearConciergeError,
  getConciergeErrorForThread,
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

  it("keeps legacy no-thread reports visible", () => {
    reportConciergeError();
    expect(getConciergeErrorSnapshot()).toMatchObject({ version: 1, threadId: null });
  });
});
