// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  appendMessage: vi.fn(),
  stopActiveRun: vi.fn(),
  retryLastTurn: vi.fn(),
  latestResult: vi.fn(),
  turns: [] as Array<{ id: string; role: "user" | "assistant"; text: string }>,
  subscribers: [] as Array<{ onMessagesChanged?: () => void; onRunFinalized?: () => void }>,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/restaurants" }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: h.user, loading: false }) }));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));
const agent = {
  messages: [], isRunning: false, threadId: "thread-1",
  subscribe: (s: { onMessagesChanged?: () => void; onRunFinalized?: () => void }) => {
    h.subscribers.push(s);
    return { unsubscribe: vi.fn() };
  },
};
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useOptionalConciergeCoAgent: () => ({ agent, isReady: true }),
  useConciergeCoAgent: () => ({ agent, isReady: true }),
}));
vi.mock("@/components/rentals/rental-ask-tool-results", () => ({ useTurns: () => h.turns }));
vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({
    appendMessage: h.appendMessage, stopActiveRun: h.stopActiveRun, retryLastTurn: h.retryLastTurn, isLoading: false, isRuntimeUnavailable: () => false,
  }),
}));
vi.mock("../discovery-tool-results", () => ({ getLatestDiscoveryToolResult: h.latestResult }));

import { DiscoveryAskComposer } from "../discovery-ask-composer";
import { clearConciergeError, reportConciergeError } from "@/lib/concierge-error-store";

const result = { kind: "restaurant", ids: ["r1"] };
const input = () => screen.getByTestId("discovery-ask-input") as HTMLTextAreaElement;
const ask = (text: string) => {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.click(screen.getByTestId("discovery-ask-send"));
};

beforeEach(() => {
  h.user = { id: "u1" };
  h.appendMessage.mockReset();
  h.stopActiveRun.mockReset();
  h.retryLastTurn.mockReset();
  agent.messages = [];
  // Like the real extractor: only results from the submitted page/start index count.
  h.latestResult.mockReset().mockImplementation((_messages: unknown, page: string, since: number) =>
    page === "restaurants" && since === 0 ? result : null);
  h.subscribers.length = 0;
  h.turns = [];
  clearConciergeError();
});
afterEach(cleanup);

describe("SAN-1145 shared Ask MDE composer — signed-in send outcomes", () => {
  it("publishes the answer's results exactly once after a successful reply", async () => {
    h.appendMessage.mockResolvedValue(true);
    const onAgentResults = vi.fn();
    render(<DiscoveryAskComposer page="restaurants" onAgentResults={onAgentResults} />);
    ask("Italian in El Poblado");
    await waitFor(() => expect(onAgentResults).toHaveBeenCalledTimes(1));
    expect(onAgentResults).toHaveBeenCalledWith(result);
    expect(h.latestResult).toHaveBeenCalledWith(agent.messages, "restaurants", 0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(input().value).toBe("");
  });

  it("does not let a run that failed replace the cards, even if the run finalizes before the check", async () => {
    h.appendMessage.mockImplementation(() => {
      reportConciergeError("thread-1");
      // The agent finalizes with a tool result already in the thread, then runAgent resolves.
      h.subscribers.forEach((s) => s.onRunFinalized?.());
      return Promise.resolve(true);
    });
    const onAgentResults = vi.fn();
    render(<DiscoveryAskComposer page="restaurants" onAgentResults={onAgentResults} />);
    ask("Italian in El Poblado");
    expect((await screen.findByRole("alert")).textContent).toContain("The response was interrupted");
    expect(onAgentResults).not.toHaveBeenCalled();
  });

  it("shows Retry only after a failed existing turn and never re-appends the user question", async () => {
    agent.messages = [{ id: "u1", role: "user", content: "What time?" }] as typeof agent.messages;
    h.appendMessage.mockImplementation(() => { reportConciergeError("thread-1"); return Promise.resolve(true); });
    h.retryLastTurn.mockResolvedValue(true);
    render(<DiscoveryAskComposer page="restaurants" />);
    ask("What time?");
    expect(await screen.findByTestId("discovery-ask-retry")).toBeTruthy();
    fireEvent.click(screen.getByTestId("discovery-ask-retry"));
    await waitFor(() => expect(h.retryLastTurn).toHaveBeenCalledTimes(1));
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId("discovery-ask-retry")).toBeNull());
  });

  it("does not offer Retry if the question was never appended to the thread", async () => {
    h.appendMessage.mockResolvedValue(false);
    render(<DiscoveryAskComposer page="restaurants" />);
    ask("What time?");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("discovery-ask-retry")).toBeNull();
    expect(h.retryLastTurn).not.toHaveBeenCalled();
  });

  it("ignores another conversation's error: a successful reply is not reported as interrupted", async () => {
    h.appendMessage.mockImplementation(() => { reportConciergeError("some-other-thread"); return Promise.resolve(true); });
    const onAgentResults = vi.fn();
    render(<DiscoveryAskComposer page="restaurants" onAgentResults={onAgentResults} />);
    ask("Italian in El Poblado");
    await waitFor(() => expect(onAgentResults).toHaveBeenCalledWith(result));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells the visitor when the server fails mid-reply instead of showing nothing, and publishes no results", async () => {
    // CopilotKit reports a failed stream through the error store and still resolves runAgent.
    h.appendMessage.mockImplementation(() => { reportConciergeError("thread-1"); return Promise.resolve(true); });
    const onAgentResults = vi.fn();
    render(<DiscoveryAskComposer page="cafes" onAgentResults={onAgentResults} />);
    ask("Quiet cafés for work");
    expect((await screen.findByRole("alert")).textContent).toContain("The response was interrupted");
    expect(onAgentResults).not.toHaveBeenCalled();
    expect(input().value).toBe("");
  });

  it("gives the question back when nothing could be sent (e.g. runtime or thread unavailable)", async () => {
    h.appendMessage.mockResolvedValue(false);
    const onAgentResults = vi.fn();
    render(<DiscoveryAskComposer page="nightlife" onAgentResults={onAgentResults} />);
    ask("Rooftop bars tonight");
    expect((await screen.findByRole("alert")).textContent).toContain("could not send your question");
    expect(input().value).toBe("Rooftop bars tonight");
    expect(onAgentResults).not.toHaveBeenCalled();
  });

  it("reports an interrupted reply when the run throws, without re-sending the question", async () => {
    h.appendMessage.mockRejectedValue(new Error("network"));
    render(<DiscoveryAskComposer page="restaurants" onAgentResults={vi.fn()} />);
    ask("Steakhouse");
    expect((await screen.findByRole("alert")).textContent).toContain("The response was interrupted");
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
    expect(input().value).toBe("");
  });

  it("Stop cancels the reply: no results, no error, and the Stop control goes away", async () => {
    let finish: (v: boolean) => void = () => {};
    h.appendMessage.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const onAgentResults = vi.fn();
    render(<DiscoveryAskComposer page="restaurants" onAgentResults={onAgentResults} />);
    ask("Seafood");
    fireEvent.click(await screen.findByTestId("discovery-ask-stop"));
    expect(h.stopActiveRun).toHaveBeenCalledTimes(1);
    await act(async () => { finish(true); });
    await waitFor(() => expect(screen.queryByTestId("discovery-ask-stop")).toBeNull());
    expect(onAgentResults).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not send a second question while one is still in flight", async () => {
    h.appendMessage.mockReturnValue(new Promise<boolean>(() => {}));
    render(<DiscoveryAskComposer page="restaurants" onAgentResults={vi.fn()} />);
    ask("First");
    await screen.findByTestId("discovery-ask-stop");
    fireEvent.change(input(), { target: { value: "Second" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Not sent yet");
  });

  it("asks a signed-out visitor to sign in instead of starting a protected chat", () => {
    h.user = null;
    render(<DiscoveryAskComposer page="restaurants" onAgentResults={vi.fn()} />);
    expect(screen.getByText("Sign in to ask about restaurants.")).toBeTruthy();
    expect(screen.queryByTestId("discovery-ask-input")).toBeNull();
    expect(h.appendMessage).not.toHaveBeenCalled();
  });
  it("retries a failed event starter-question without appending another user turn", async () => {
    agent.messages = [{ id: "u1", role: "user", content: "Are tickets available?" }] as typeof agent.messages;
    h.appendMessage.mockImplementation(() => { reportConciergeError("thread-1"); return Promise.resolve(true); });
    h.retryLastTurn.mockResolvedValue(true);
    render(<DiscoveryAskComposer page="events" suggestions={["Are tickets available?"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Are tickets available?" }));
    expect((await screen.findByRole("alert")).textContent).toContain("interrupted");
    fireEvent.click(screen.getByTestId("discovery-ask-retry"));
    await waitFor(() => expect(h.retryLastTurn).toHaveBeenCalledTimes(1));
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
  });

});

describe("Ask MDE compact history — latest answer and intentional scrolling", () => {
  it("follows three sequential replies, renders Markdown, and pauses while reading earlier messages", () => {
    const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const originalClient = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: function (this: HTMLElement) { return this.getAttribute("data-testid") === "discovery-ask-history" ? 250 + h.turns.length * 125 : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: function (this: HTMLElement) { return this.getAttribute("data-testid") === "discovery-ask-history" ? 120 : 0; },
    });
    try {
      const { rerender } = render(<DiscoveryAskComposer page="events" />);
      const addAnswer = (index: number, question: string, answer: string) => {
        h.turns = [...h.turns,
          { id: `q-${index}`, role: "user" as const, text: question },
          { id: `a-${index}`, role: "assistant" as const, text: answer },
        ];
        rerender(<DiscoveryAskComposer page="events" />);
        return screen.getByTestId("discovery-ask-history") as HTMLOListElement;
      };

      const first = addAnswer(1, "Reina prices?", "Tickets: **VIP COP 120,000**\n\n- General Admission COP 40,000");
      expect(first.scrollTop).toBe(first.scrollHeight);
      expect(first.querySelector("strong")?.textContent).toContain("VIP COP 120,000");
      expect(first.querySelector("li li")?.textContent).toContain("General Admission COP 40,000");

      const second = addAnswer(2, "Feria tickets?", "**No tickets are currently listed** for Feria.");
      expect(second.scrollTop).toBe(second.scrollHeight);
      expect(second.lastElementChild?.textContent).toContain("No tickets are currently listed");
      expect(second.lastElementChild?.textContent).not.toContain("**");

      // A reader who intentionally scrolls up must not be pulled away by a new message.
      second.scrollTop = 0;
      fireEvent.scroll(second);
      const third = addAnswer(3, "Compare the events", "Reina lists VIP, but Feria has **no listed tiers**.");
      expect(third.scrollTop).toBe(0);
      expect(third.lastElementChild?.textContent).toContain("no listed tiers");

      // Once the reader returns to the bottom, streaming updates should follow again.
      third.scrollTop = third.scrollHeight - third.clientHeight;
      fireEvent.scroll(third);
      h.turns = h.turns.map((t) => t.id === "a-3"
        ? { ...t, text: "Reina lists VIP, but Feria has **no listed tiers**. The meeting point is unconfirmed.\n\n| Event | Ticket |\n| --- | --- |\n| Reina | VIP COP 120,000 |\n| Feria | Not listed |" }
        : t);
      rerender(<DiscoveryAskComposer page="events" />);
      expect(third.scrollTop).toBe(third.scrollHeight);
      expect(third.lastElementChild?.textContent).toContain("meeting point is unconfirmed");
      expect(third.querySelector("table")?.textContent).toContain("VIP COP 120,000");
      // Explicitly hiding then reopening the history returns to the newest response.
      third.scrollTop = 0;
      fireEvent.scroll(third);
      fireEvent.click(screen.getByTestId("discovery-ask-history-toggle"));
      expect(screen.queryByTestId("discovery-ask-history")).toBeNull();
      fireEvent.click(screen.getByTestId("discovery-ask-history-toggle"));
      const reopened = screen.getByTestId("discovery-ask-history") as HTMLOListElement;
      expect(reopened.scrollTop).toBe(reopened.scrollHeight);
    } finally {
      if (originalHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalHeight);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
      if (originalClient) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClient);
      else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    }
  });
});
