// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AGENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SELECTED_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const mock = vi.hoisted(() => {
  const agent = { threadId: "", isRunning: false, addMessage: vi.fn() };
  const nav = {
    ready: true,
    sessionThreadId: "",
    activeThreadId: undefined as string | undefined,
    hasPersistedThread: false,
    markThreadSaved: vi.fn(),
  };
  const runtime = { runtimeConnectionStatus: "connected", runAgent: vi.fn(async () => {}) };
  return { agent, nav, runtime, ensureTitle: vi.fn() };
});

vi.mock("@copilotkit/react-core/v2", () => ({
  useCopilotKit: () => ({ copilotkit: mock.runtime }),
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent: mock.agent }),
}));
vi.mock("@/lib/chat/thread-nav-context", () => ({
  useOptionalThreadNav: () => mock.nav,
}));
vi.mock("@/lib/chat/ensure-thread-title", () => ({
  ensureThreadTitle: mock.ensureTitle,
}));
vi.mock("@/lib/deterministic-e2e", () => ({
  isDeterministicE2E: () => false,
}));

import { useConciergeChat } from "../use-concierge-chat";

beforeEach(() => {
  mock.agent.threadId = AGENT_ID; // CopilotKit v2's non-explicit agent-created ID
  mock.agent.addMessage.mockClear();
  mock.runtime.runAgent.mockClear();
  mock.nav.markThreadSaved.mockClear();
  mock.ensureTitle.mockClear();
  mock.nav.ready = true;
  mock.nav.sessionThreadId = TAB_ID;
  mock.nav.activeThreadId = undefined;
  mock.nav.hasPersistedThread = false;
});

describe("SAN-1421 · tab thread identity on first live send", () => {
  it("uses the tab's fresh thread for the agent run and durable saved-thread selection", async () => {
    const idsAtRun: string[] = [];
    mock.runtime.runAgent.mockImplementationOnce(async () => { idsAtRun.push(mock.agent.threadId); });
    const { result } = renderHook(() => useConciergeChat());
    await act(async () => { expect(await result.current.appendMessage("2BR Laureles")).toBe(true); });
    expect(idsAtRun).toEqual([TAB_ID]);
    expect(mock.nav.markThreadSaved).toHaveBeenCalledWith(TAB_ID);
    expect(mock.ensureTitle).toHaveBeenCalledWith(TAB_ID);
  });

  it("does not overwrite a selected saved thread", async () => {
    mock.nav.activeThreadId = SELECTED_ID;
    mock.nav.hasPersistedThread = true;
    mock.agent.threadId = SELECTED_ID;
    const { result } = renderHook(() => useConciergeChat());
    await act(async () => { await result.current.appendMessage("has parking?"); });
    expect(mock.agent.threadId).toBe(SELECTED_ID);
    expect(mock.nav.markThreadSaved).toHaveBeenCalledWith(SELECTED_ID);
  });

  it("never marks a failed agent run as saved", async () => {
    mock.runtime.runAgent.mockRejectedValueOnce(new Error("failure"));
    const { result } = renderHook(() => useConciergeChat());
    await expect(act(async () => { await result.current.appendMessage("Laureles"); })).rejects.toThrow();
    expect(mock.nav.markThreadSaved).not.toHaveBeenCalled();
  });
});
