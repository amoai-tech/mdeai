import { beforeEach, describe, expect, it } from "vitest";
import {
  clearConciergeError,
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

  it("keeps legacy no-thread reports visible", () => {
    reportConciergeError();
    expect(getConciergeErrorSnapshot()).toMatchObject({ version: 1, threadId: null });
  });
});
