import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearConciergeError, reportConciergeError } from "@/lib/concierge-error-store";

/**
 * SAN-1378: switching conversation while a reply is still streaming must stop
 * that run first. CopilotKit 1.75.0 clears the view on a thread switch but does
 * not stop an in-flight run, so on the #192 preview the old answer kept
 * streaming into the new chat and was then saved into the new thread.
 */
const calls: string[] = [];
const ensureMock = vi.fn();
const agent = {
  isRunning: false,
  threadId: "",
  messages: [{ id: "user-1", role: "user", content: "Find rentals" }],
  addMessage: vi.fn(),
  setMessages: vi.fn(() => calls.push("setMessages")),
  setState: vi.fn(() => calls.push("setState")),
  abortRun: vi.fn(() => calls.push("abortRun")),
  detachActiveRun: vi.fn(async () => {
    calls.push("detachActiveRun");
  }),
};
const copilotkit = {
  runtimeConnectionStatus: "connected",
  stopAgent: vi.fn(() => calls.push("stopAgent")),
  runAgent: vi.fn(),
};
// The hook's only React API is useCallback; run it as a plain function.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: <T>(fn: T) => fn,
  useRef: <T>(value: T) => ({ current: value }),
  useEffect: (fn: () => void) => fn(),
}));
vi.mock("@copilotkit/react-core/v2", () => ({ useCopilotKit: () => ({ copilotkit }) }));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent }),
}));
vi.mock("@/lib/chat/thread-nav-context", () => ({ useOptionalThreadNav: () => null }));

vi.mock("@/lib/chat/ensure-thread-title", () => ({
  ensureThreadTitle: (id: string) => ensureMock(id),
}));

vi.mock("@/lib/chat/ensure-thread-title", () => ({
  ensureThreadTitle: (id: string) => ensureMock(id),
}));

import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";

beforeEach(() => {
  clearConciergeError();
  calls.length = 0;
  vi.clearAllMocks();
  agent.isRunning = false;
  copilotkit.runtimeConnectionStatus = "connected";
  agent.threadId = "";
  agent.messages = [{ id: "user-1", role: "user", content: "Find rentals" }];
  ensureMock.mockReset();
  ensureMock.mockResolvedValue(true);
});

describe("SAN-1396 — wait for a signed-in cold runtime without duplicate sends", () => {
  it("returns immediately once an agent and runtime are connected", async () => {
    await expect(useConciergeChat().waitForRuntimeReady()).resolves.toBe(true);
  });

  it("waits for a connecting runtime to become ready", async () => {
    vi.useFakeTimers();
    try {
      copilotkit.runtimeConnectionStatus = "connecting";
      const ready = useConciergeChat().waitForRuntimeReady(800);
      copilotkit.runtimeConnectionStatus = "connected";
      await vi.advanceTimersByTimeAsync(125);
      await expect(ready).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails without an agent run when the runtime reports an error", async () => {
    copilotkit.runtimeConnectionStatus = "error";
    await expect(useConciergeChat().waitForRuntimeReady()).resolves.toBe(false);
    expect(copilotkit.runAgent).not.toHaveBeenCalled();
  });

  it("fails within a bounded timeout if connection never succeeds", async () => {
    vi.useFakeTimers();
    try {
      copilotkit.runtimeConnectionStatus = "connecting";
      const ready = useConciergeChat().waitForRuntimeReady(500);
      await vi.advanceTimersByTimeAsync(625);
      await expect(ready).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useConciergeChat — switching conversation mid-reply", () => {
  it("reset stops a running reply before clearing the conversation", () => {
    agent.isRunning = true;
    const chat = useConciergeChat();
    chat.reset();
    expect(copilotkit.stopAgent).toHaveBeenCalledWith({ agent });
    expect(agent.detachActiveRun).toHaveBeenCalledTimes(1);
    expect(calls.indexOf("stopAgent")).toBeLessThan(calls.indexOf("setMessages"));
    expect(calls.indexOf("detachActiveRun")).toBeLessThan(calls.indexOf("setMessages"));
  });

  it("stopActiveRun stops only when a reply is running", () => {
    const chat = useConciergeChat();
    chat.stopActiveRun();
    expect(copilotkit.stopAgent).not.toHaveBeenCalled();
    expect(agent.detachActiveRun).not.toHaveBeenCalled();
    agent.isRunning = true;
    chat.stopActiveRun();
    expect(copilotkit.stopAgent).toHaveBeenCalledTimes(1);
  });

  it("retries the existing turn without adding a duplicate user message", async () => {
    agent.isRunning = false;
    agent.threadId = "thread-1";
    copilotkit.runAgent.mockResolvedValue(undefined);
    const chat = useConciergeChat();
    await expect(chat.retryLastTurn()).resolves.toBe(true);
    expect(agent.addMessage).not.toHaveBeenCalled();
    expect(copilotkit.runAgent).toHaveBeenCalledWith({ agent });
    expect(ensureMock).toHaveBeenCalledWith("thread-1");
  });

  it("rejects retry when there is no user message to replay", async () => {
    agent.messages = [];
    const chat = useConciergeChat();
    await expect(chat.retryLastTurn()).resolves.toBe(false);
    expect(copilotkit.runAgent).not.toHaveBeenCalled();
  });

  it("permits only one retry while the first run has not started streaming", async () => {
    agent.threadId = "thread-1";
    let complete!: () => void;
    copilotkit.runAgent.mockReturnValue(new Promise<void>((resolve) => { complete = resolve; }));
    const chat = useConciergeChat();
    const first = chat.retryLastTurn();
    await expect(chat.retryLastTurn()).resolves.toBe(false);
    expect(copilotkit.runAgent).toHaveBeenCalledTimes(1);
    complete();
    await expect(first).resolves.toBe(true);
    await expect(chat.retryLastTurn()).resolves.toBe(true);
    expect(copilotkit.runAgent).toHaveBeenCalledTimes(2);
  });

  it("does not title a different thread after a mid-retry switch", async () => {
    agent.threadId = "thread-1";
    let complete!: () => void;
    copilotkit.runAgent.mockReturnValue(new Promise<void>((resolve) => { complete = resolve; }));
    const first = useConciergeChat().retryLastTurn();
    agent.threadId = "thread-2";
    complete();
    await expect(first).resolves.toBe(true);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("does not claim a resolved stream was successful when onError fired", async () => {
    agent.threadId = "thread-1";
    // The live CopilotKit provider forwards the selected thread ID on error.
    copilotkit.runAgent.mockImplementation(async () => { reportConciergeError("thread-1"); });
    await expect(useConciergeChat().retryLastTurn()).resolves.toBe(false);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("does not retry a failure owned by another conversation", async () => {
    agent.isRunning = false;
    agent.threadId = "thread-1";
    reportConciergeError("thread-2");
    const chat = useConciergeChat();
    await expect(chat.retryLastTurn()).resolves.toBe(false);
    expect(copilotkit.runAgent).not.toHaveBeenCalled();
    clearConciergeError();
  });

  it("does not retry while a reply is running", async () => {
    agent.isRunning = true;
    const chat = useConciergeChat();
    await expect(chat.retryLastTurn()).resolves.toBe(false);
    expect(copilotkit.runAgent).not.toHaveBeenCalled();
  });

  it("falls back to abortRun if stopAgent throws", () => {
    agent.isRunning = true;
    copilotkit.stopAgent.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const chat = useConciergeChat();
    chat.stopActiveRun();
    expect(agent.abortRun).toHaveBeenCalledTimes(1);
  });
});

describe("useConciergeChat — titling a saved chat (SAN-1412)", () => {
  it("asks for a title for that chat after the agent turn succeeds", async () => {
    agent.threadId = "thread-1";
    copilotkit.runAgent.mockResolvedValue(undefined);
    const chat = useConciergeChat();
    await expect(chat.appendMessage("2BR in Laureles")).resolves.toBe(true);
    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(ensureMock).toHaveBeenCalledWith("thread-1");
  });

  it("does not wait for the title, so a slow or failing title request never delays or breaks the turn", async () => {
    agent.threadId = "thread-1";
    copilotkit.runAgent.mockResolvedValue(undefined);
    ensureMock.mockReturnValue(new Promise(() => {})); // never settles
    const chat = useConciergeChat();
    await expect(chat.appendMessage("hi")).resolves.toBe(true);
  });

  it("requests no title when the turn fails", async () => {
    agent.threadId = "thread-1";
    copilotkit.runAgent.mockRejectedValue(new Error("run failed"));
    const chat = useConciergeChat();
    await expect(chat.appendMessage("hi")).rejects.toThrow("run failed");
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("requests no title when the agent has no thread id", async () => {
    agent.threadId = "";
    copilotkit.runAgent.mockResolvedValue(undefined);
    const chat = useConciergeChat();
    await chat.appendMessage("hi");
    expect(ensureMock).not.toHaveBeenCalled();
  });
});
