// @vitest-environment jsdom
/**
 * SAN-1624 — the suggested questions now live in the inline composer on the event page.
 * These keep the guarantees the retired event drawer had: one click = one real turn,
 * and a rapid double click cannot send the same question twice.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  appendMessage: vi.fn(),
  isReady: true,
  signedIn: true,
}));

const agent = {
  messages: [] as unknown[],
  isRunning: false,
  threadId: "thread-inline",
  subscribe: () => ({ unsubscribe: vi.fn() }),
};

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: h.signedIn ? { id: "u1" } : null, loading: false }),
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useOptionalConciergeCoAgent: () => ({ agent, isReady: h.isReady }),
  useConciergeCoAgent: () => ({ agent, isReady: h.isReady }),
}));
vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({
    appendMessage: h.appendMessage,
    stopActiveRun: vi.fn(),
    retryLastTurn: vi.fn(),
    isLoading: false,
    isRuntimeUnavailable: () => false,
  }),
}));
vi.mock("@/components/rentals/rental-ask-tool-results", () => ({ useTurns: () => [] }));
vi.mock("next/navigation", () => ({ usePathname: () => "/events/a1b2c3d4-0001-0001-0001-000000000003" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const { DiscoveryAskComposer, EVENT_DETAIL_ASK_SUGGESTIONS } = await import("../discovery-ask-composer");

const QUESTIONS = EVENT_DETAIL_ASK_SUGGESTIONS;

beforeEach(() => {
  h.appendMessage.mockReset();
  h.appendMessage.mockResolvedValue(true);
  h.isReady = true;
  h.signedIn = true;
});

afterEach(cleanup);

describe("SAN-1624 — inline Ask MDE suggestions", () => {
  it("shows exactly the three event questions", () => {
    render(<DiscoveryAskComposer page="events" suggestions={QUESTIONS} hideHeading />);
    const chips = screen.getAllByTestId("discovery-ask-suggestion");
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.textContent)).toEqual([
      "Are tickets available?",
      "Where is the meeting point?",
      "When does it start?",
    ]);
  });

  it("sends exactly one real turn when a question is clicked", async () => {
    render(<DiscoveryAskComposer page="events" suggestions={QUESTIONS} hideHeading />);
    await userEvent.click(screen.getByRole("button", { name: "Are tickets available?" }));
    await waitFor(() => expect(h.appendMessage).toHaveBeenCalledTimes(1));
    expect(h.appendMessage).toHaveBeenCalledWith("Are tickets available?");
  });

  it("does not duplicate the turn when the same question is clicked twice quickly", async () => {
    let finish: (saved: boolean) => void = () => undefined;
    h.appendMessage.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    render(<DiscoveryAskComposer page="events" suggestions={QUESTIONS} hideHeading />);
    const chip = screen.getByRole("button", { name: "Are tickets available?" });
    act(() => { chip.click(); chip.click(); });
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
    await act(async () => { finish(true); });
  });

  it("keeps guests on the existing sign-in state with no questions", () => {
    h.signedIn = false;
    render(<DiscoveryAskComposer page="events" suggestions={QUESTIONS} hideHeading />);
    expect(screen.queryByTestId("discovery-ask-suggestion")).toBeNull();
    expect(screen.getByText(/Sign in to ask about events/i)).toBeTruthy();
  });
});
