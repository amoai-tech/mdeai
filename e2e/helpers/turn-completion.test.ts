import { describe, expect, it } from "vitest";
import {
  assessRunResponse,
  assessTurn,
  awaitRunResponse,
  hasStarted,
  isTerminal,
  type TurnObservation,
} from "./turn-completion";

const observation = (overrides: Partial<TurnObservation> = {}): TurnObservation => ({
  settled: false,
  failure: null,
  stopVisible: false,
  repliesBefore: 1,
  repliesNow: 1,
  ...overrides,
});

describe("assessTurn — the helper must never report success early", () => {
  it("ignores a PREVIOUS assistant answer as evidence the new run started", () => {
    // One old reply on screen, no new one, nothing running yet: the old answer
    // must not satisfy the "started" check.
    expect(assessTurn(observation({ repliesBefore: 1, repliesNow: 1 }))).toBe("pending");
    expect(hasStarted(assessTurn(observation({ repliesBefore: 1, repliesNow: 1 })))).toBe(false);
  });

  it("reports a delayed start only once the new run shows itself", () => {
    expect(assessTurn(observation({ stopVisible: true }))).toBe("running");
    expect(hasStarted(assessTurn(observation({ stopVisible: true })))).toBe(true);
    expect(hasStarted(assessTurn(observation({ repliesNow: 2 })))).toBe(true);
  });

  it("accepts immediate completion from a fast-path answer", () => {
    expect(assessTurn(observation({ settled: true }))).toBe("done");
    expect(isTerminal(assessTurn(observation({ settled: true })))).toBe(true);
  });

  it("accepts a finished run whose response stream stays open", () => {
    // New reply visible, Stop gone, stream still open: finished, not stuck.
    expect(assessTurn(observation({ repliesNow: 2 }))).toBe("done");
  });

  it("keeps waiting while the run is still streaming", () => {
    const streaming = observation({ stopVisible: true, repliesNow: 2 });
    expect(assessTurn(streaming)).toBe("running");
    expect(isTerminal(assessTurn(streaming))).toBe(false);
  });

  it("reports an HTTP failure as failed, never as done", () => {
    const state = assessTurn(observation({ failure: new Error("history 500"), settled: true }));
    expect(state).toBe("failed");
  });

  it("reports a rejected agent run as failed even with the Stop control gone", () => {
    // The dangerous case: nothing is on screen, Stop is gone, and the run failed.
    const state = assessTurn(observation({ failure: new Error("Agent execution failed") }));
    expect(state).toBe("failed");
    expect(isTerminal(state)).toBe(true);
  });

  it("does not treat a stopped run as a completed turn without a new reply", () => {
    // The user pressed Stop: no new reply, nothing running, response may settle.
    expect(assessTurn(observation({ repliesBefore: 1, repliesNow: 1 }))).toBe("pending");
  });
});

describe("assessRunResponse — the body finishing is not evidence of success", () => {
  it("treats a missing response as a failure", () => {
    // Playwright returns null when the request failed before any response.
    expect(assessRunResponse(null)).toEqual({
      kind: "failed",
      reason: "the run request failed before receiving a response",
    });
  });

  it.each([400, 401, 403, 429, 500, 502, 503])("treats HTTP %i as a failure", (status) => {
    expect(assessRunResponse(status)).toEqual({
      kind: "failed",
      reason: `the run request failed with HTTP ${status}`,
    });
  });

  it.each([200, 201, 204])("treats HTTP %i as success", (status) => {
    expect(assessRunResponse(status)).toEqual({ kind: "ok" });
  });
});

describe("awaitRunResponse — failure must not hide behind an open stream", () => {
  it("rejects when no response ever arrived", async () => {
    await expect(awaitRunResponse(null)).rejects.toThrow(/before receiving a response/);
  });

  it("rejects an HTTP 500 even though its body finishes normally", async () => {
    const response = { status: () => 500, finished: async () => null };
    await expect(awaitRunResponse(response)).rejects.toThrow(/HTTP 500/);
  });

  it("rejects an HTTP 500 without waiting on a stream that never closes", async () => {
    // If the status check ran after `finished()`, this would hang forever.
    const response = {
      status: () => 500,
      finished: () => new Promise<Error | null>(() => undefined),
    };
    await expect(awaitRunResponse(response)).rejects.toThrow(/HTTP 500/);
  });

  it("resolves only after a successful body finishes", async () => {
    let finished = false;
    const response = {
      status: () => 200,
      finished: async () => {
        finished = true;
        return null;   // Playwright resolves with null on a clean stream
      },
    };
    await awaitRunResponse(response);
    expect(finished).toBe(true);
  });

  it("surfaces an aborted stream that Playwright reports by RESOLVING with an Error", async () => {
    // `finished()` resolves with an Error instead of rejecting; ignoring the return
    // value silently turned a broken stream into a success.
    const response = { status: () => 200, finished: async () => new Error("net::ERR_ABORTED") };
    await expect(awaitRunResponse(response)).rejects.toThrow(/ERR_ABORTED/);
  });

  it("surfaces a body read that rejects outright", async () => {
    const response = {
      status: () => 200,
      finished: async () => {
        throw new Error("aborted");
      },
    };
    await expect(awaitRunResponse(response)).rejects.toThrow(/aborted/);
  });
});

describe("assessTurn — a completed request is not a rendered answer", () => {
  it("does not certify a 200 that rendered no answer when an answer is required", () => {
    // The request finished cleanly but nothing appeared: the user got nothing.
    const state = assessTurn(observation({ settled: true, requireNewReply: true }));
    expect(state).toBe("pending");
    expect(isTerminal(state)).toBe(false);
  });

  it("certifies the same turn once the answer actually renders", () => {
    const state = assessTurn(
      observation({ settled: true, requireNewReply: true, repliesNow: 2 }),
    );
    expect(state).toBe("done");
  });

  it("keeps the previous behaviour when no answer is required", () => {
    // Fast-path answers and fire-and-forget turns legitimately produce no reply.
    expect(assessTurn(observation({ settled: true }))).toBe("done");
  });

  it("still reports failure ahead of the missing answer", () => {
    expect(
      assessTurn(observation({ failure: new Error("HTTP 500"), settled: true, requireNewReply: true })),
    ).toBe("failed");
  });
});
