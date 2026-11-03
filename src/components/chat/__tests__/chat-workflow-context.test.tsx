// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatWorkflowProvider,
  useChatWorkflow,
} from "@/components/chat/chat-workflow-context";

let report: ReturnType<typeof useChatWorkflow>["reportToolStatus"];

function ProgressProbe() {
  const { snapshot, reportToolStatus } = useChatWorkflow();
  useEffect(() => {
    report = reportToolStatus;
  }, [reportToolStatus]);
  return (
    <output data-testid="phase">
      {`${snapshot.kind ?? "none"}:${snapshot.phase}`}
    </output>
  );
}

function mountProgress() {
  vi.useFakeTimers();
  return render(
    <ChatWorkflowProvider>
      <ProgressProbe />
    </ChatWorkflowProvider>,
  );
}

function expectPhase(value: string) {
  expect(screen.getByTestId("phase").textContent).toBe(value);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("terminal progress dismissal", () => {
  it("does not dismiss a newer different-kind run", () => {
    mountProgress();
    act(() => report("event", "running"));
    act(() => report("event", "complete"));
    act(() => vi.advanceTimersByTime(800));
    act(() => report("rental", "running"));
    act(() => vi.advanceTimersByTime(3_000));
    expectPhase("rental:running");
  });

  it("does not dismiss a same-kind retry after failure", () => {
    mountProgress();
    act(() => report("event", "running"));
    act(() => report("event", "error"));
    act(() => vi.advanceTimersByTime(600));
    act(() => report("event", "running"));
    act(() => vi.advanceTimersByTime(3_500));
    expectPhase("event:running");
  });

  it("clears the pending timer when the provider unmounts", () => {
    const view = mountProgress();
    act(() => report("event", "complete"));
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dismisses the latest completed run after 2800ms", () => {
    mountProgress();
    act(() => report("event", "running"));
    act(() => report("event", "complete"));
    act(() => vi.advanceTimersByTime(2_800));
    expectPhase("none:idle");
  });
});
