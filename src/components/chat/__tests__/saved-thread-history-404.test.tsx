// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavedThreadHistory, useSavedThreadHistory } from "@/components/chat/chat-provider";

const runtime = vi.hoisted(() => ({
  agent: {
    threadId: "fresh-thread",
    isRunning: false,
    messages: [] as unknown[],
    subscribe: () => ({ unsubscribe: () => {} }),
    setMessages: vi.fn(),
  },
}));
vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: ({ children }: { children: React.ReactNode }) => children,
  CopilotChatConfigurationProvider: ({ children }: { children: React.ReactNode }) => children,
  useAgent: () => ({ agent: runtime.agent, isReady: true }),
  UseAgentUpdate: { OnRunStatusChanged: "status", OnMessagesChanged: "messages" },
}));
vi.mock("@/components/copilot/a2ui/mde-ui-catalog", () => ({ mdeUI: {} }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;

function Status() {
  const state = useSavedThreadHistory();
  return <span data-testid="history-status">{state.status}</span>;
}

async function renderHistory(status: number) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status === 200,
    status,
    json: async () => ({ messages: [] }),
  }));
  await act(async () => {
    root.render(<SavedThreadHistory threadId="fresh-thread"><Status /></SavedThreadHistory>);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
  return container.querySelector('[data-testid="history-status"]')?.textContent;
}

beforeEach(() => {
  vi.useFakeTimers();
  runtime.agent.messages = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  container.remove();
});

describe("saved thread history missing-row safety", () => {
  it("keeps missing saved history visible instead of silently erasing a conversation", async () => {
    expect(await renderHistory(404)).toBe("error");
  });

  it("preserves authorization failure when loading saved history", async () => {
    expect(await renderHistory(403)).toBe("error");
  });

  it("loads successfully when the owner-checked history API returns data", async () => {
    expect(await renderHistory(200)).toBe("idle");
  });
});
