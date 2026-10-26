// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const agent = {
    messages: [] as unknown[],
    isRunning: false,
    subscriber: null as null | { onMessagesChanged?: () => void; onRunFinalized?: () => void },
    subscribe: vi.fn((subscriber: { onMessagesChanged?: () => void; onRunFinalized?: () => void }) => {
      agent.subscriber = subscriber;
      return { unsubscribe: vi.fn(() => { agent.subscriber = null; }) };
    }),
  };
  return { agent, append: vi.fn<(...args: string[]) => Promise<boolean>>() };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/restaurants" }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: { id: "test-user" }, loading: false }) }));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useOptionalConciergeCoAgent: () => ({ agent: harness.agent, isReady: true }),
  useConciergeCoAgent: () => ({ agent: harness.agent, isReady: true }),
}));
vi.mock("@/components/rentals/rental-ask-tool-results", () => ({ useTurns: () => [] }));
vi.mock("@/lib/hooks/use-concierge-chat", () => ({ useConciergeChat: () => ({
  appendMessage: harness.append, stopActiveRun: vi.fn(), isLoading: false,
  isRuntimeUnavailable: () => false,
}) }));
import { DiscoveryAskComposer } from "../discovery-ask-composer";

afterEach(() => {
  cleanup();
  harness.agent.messages = [];
  harness.agent.isRunning = false;
  harness.agent.subscriber = null;
  harness.append.mockReset();
});

describe("signed-in Ask MDE tool delivery", () => {
  it("publishes the current search only after the agent finishes, exactly once", async () => {
    let resolveRun: ((value: boolean) => void) | undefined;
    harness.append.mockImplementation(() => new Promise<boolean>((resolve) => { resolveRun = resolve; }));
    const onAgentResults = vi.fn();
    render(<DiscoveryAskComposer page="restaurants" onAgentResults={onAgentResults} />);
    fireEvent.change(screen.getByTestId("discovery-ask-input"), { target: { value: "Italian in Laureles" } });
    fireEvent.click(screen.getByTestId("discovery-ask-send"));
    await waitFor(() => expect(harness.append).toHaveBeenCalledTimes(1));
    expect(harness.agent.subscriber).not.toBeNull();
    act(() => {
      harness.agent.isRunning = true;
      harness.agent.messages.push(
        { role: "user", content: "Italian in Laureles" },
        { role: "assistant", toolCalls: [{ id: "call-one", function: { name: "searchRestaurantsTool" } }] },
        { role: "tool", toolCallId: "call-one", content: JSON.stringify({ results: [{ id: "r1", name: "Italian place", neighborhood: "Laureles", cuisine: "italian" }] }) },
      );
      harness.agent.subscriber?.onMessagesChanged?.();
    });
    expect(onAgentResults).not.toHaveBeenCalled();
    act(() => {
      harness.agent.isRunning = false;
      harness.agent.subscriber?.onRunFinalized?.();
      harness.agent.subscriber?.onMessagesChanged?.();
    });
    expect(onAgentResults).toHaveBeenCalledTimes(1);
    expect(onAgentResults).toHaveBeenCalledWith({ page: "restaurants", rows: [expect.objectContaining({ id: "r1" })] });
    await act(async () => resolveRun?.(true));
    expect(onAgentResults).toHaveBeenCalledTimes(1);
  });
});
