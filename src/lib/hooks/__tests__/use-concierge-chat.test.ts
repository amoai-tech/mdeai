import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SAN-1378: switching conversation while a reply is still streaming must stop
 * that run first. CopilotKit 1.75.0 clears the view on a thread switch but does
 * not stop an in-flight run, so on the #192 preview the old answer kept
 * streaming into the new chat and was then saved into the new thread.
 */
const calls: string[] = [];
const agent = {
  isRunning: false,
  setMessages: vi.fn(() => calls.push("setMessages")),
  setState: vi.fn(() => calls.push("setState")),
  abortRun: vi.fn(() => calls.push("abortRun")),
};
const copilotkit = {
  stopAgent: vi.fn(() => calls.push("stopAgent")),
  runAgent: vi.fn(),
};
// The hook's only React API is useCallback; run it as a plain function.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: <T>(fn: T) => fn,
}));
vi.mock("@copilotkit/react-core/v2", () => ({ useCopilotKit: () => ({ copilotkit }) }));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent }),
}));

import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  agent.isRunning = false;
});

describe("useConciergeChat — switching conversation mid-reply", () => {
  it("reset stops a running reply before clearing the conversation", () => {
    agent.isRunning = true;
    const chat = useConciergeChat();
    chat.reset();
    expect(copilotkit.stopAgent).toHaveBeenCalledWith({ agent });
    expect(calls.indexOf("stopAgent")).toBeLessThan(calls.indexOf("setMessages"));
  });

  it("stopActiveRun stops only when a reply is running", () => {
    const chat = useConciergeChat();
    chat.stopActiveRun();
    expect(copilotkit.stopAgent).not.toHaveBeenCalled();
    agent.isRunning = true;
    chat.stopActiveRun();
    expect(copilotkit.stopAgent).toHaveBeenCalledTimes(1);
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
