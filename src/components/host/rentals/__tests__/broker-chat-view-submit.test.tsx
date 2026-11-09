// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isLiveUserMessage } from "@/lib/chat/live-user-message-ids";

const THREAD = "11111111-2222-4333-8444-555555555555";
const agent = { messages: [] as { id: string; role: string; content: string }[] };

vi.mock("@copilotkit/react-core/v2", () => {
  const CopilotChatView = ({ onSubmitMessage }: { onSubmitMessage?: (text: string) => void }) => (
    <button onClick={() => onSubmitMessage?.("my broker question")}>Send through native input</button>
  );
  return { CopilotChatView, CopilotChat: () => null, useAgent: () => ({ agent }) };
});
vi.mock("@/lib/chat/thread-nav-context", () => ({ useThreadNav: () => ({ activeThreadId: THREAD, sessionThreadId: THREAD }) }));
vi.mock("@/components/chat/chat-provider", () => ({ ChatProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/host/rentals/broker-workspace-tool-renderer", () => ({ BrokerWorkspaceToolRenderer: () => null }));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));

import { BrokerChatView } from "@/components/host/rentals/rentals-concierge-center";

describe("broker's actual CopilotChat input", () => {
  it("marks the native SDK-created user message, not reconnected saved history", async () => {
    agent.messages = [{ id: "storedU", role: "user", content: "already saved" }];
    render(<BrokerChatView onSubmitMessage={async (text) => {
      // The SDK queues asynchronously, then assigns its own message ID.
      await Promise.resolve();
      agent.messages = [...agent.messages, { id: "nativeU", role: "user", content: text }];
    }} />);
    expect(isLiveUserMessage(agent, THREAD, "storedU", "already saved")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Send through native input" }));
    await waitFor(() => expect(isLiveUserMessage(agent, THREAD, "nativeU", "my broker question")).toBe(true));
    expect(isLiveUserMessage(agent, THREAD, "storedU", "already saved")).toBe(false);
  });
});
