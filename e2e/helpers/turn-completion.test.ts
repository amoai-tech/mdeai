import { describe, expect, it } from "vitest";
import { assessTurn, hasStarted, isTerminal, type TurnObservation } from "./turn-completion";

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
