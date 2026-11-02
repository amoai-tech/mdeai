// @vitest-environment jsdom
/**
 * SAN-1620 S7 — suggested questions in the event-detail Ask MDE drawer.
 *
 * These render the real sheet and the real composer together, so the proof is the
 * visitor journey: opening the drawer starts nothing, and a click is one normal turn.
 */
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pathname: "/events/a1b2c3d4-0001-0001-0001-000000000003",
  user: { id: "u1" } as { id: string } | null,
  isReady: true,
  appendMessage: vi.fn(),
}));

const agent = {
  messages: [] as unknown[],
  isRunning: false,
  threadId: "thread-1",
  subscribe: () => ({ unsubscribe: vi.fn() }),
};

vi.mock("next/navigation", () => ({
  usePathname: () => h.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: h.user, loading: false }) }));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useOptionalConciergeCoAgent: () => ({ agent, isReady: h.isReady }),
  useConciergeCoAgent: () => ({ agent, isReady: h.isReady }),
}));
// The page-context bridge is another agent's surface; it is not what this test proves.
vi.mock("@/components/chat/discovery-page-context", () => ({ DiscoveryPageContext: () => null }));
vi.mock("@/components/rentals/rental-ask-tool-results", () => ({ useTurns: () => [] }));
vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({
    appendMessage: h.appendMessage,
    stopActiveRun: vi.fn(),
    isLoading: false,
    isRuntimeUnavailable: () => false,
  }),
}));

import { AskMdeSheet } from "../ask-mde-sheet";
import { openAskMde } from "@/lib/chat/ask-mde-bridge";
import { EVENT_DETAIL_ASK_SUGGESTIONS } from "../discovery-ask-composer";

const QUESTIONS = [
  "Are tickets available?",
  "Where is the meeting point?",
  "When does it start?",
];

const openEventDrawer = async () => {
  render(<AskMdeSheet />);
  act(() => { openAskMde(); });
  return screen.findByTestId("discovery-ask-suggestions");
};

beforeEach(() => {
  h.pathname = "/events/a1b2c3d4-0001-0001-0001-000000000003";
  h.user = { id: "u1" };
  h.isReady = true;
  h.appendMessage.mockReset();
  h.appendMessage.mockResolvedValue(true);
});
afterEach(cleanup);

describe("SAN-1620 S7 event-start questions", () => {
  it("shows exactly the three event questions and runs nothing when the drawer opens", async () => {
    const group = await openEventDrawer();
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(QUESTIONS);
    expect(EVENT_DETAIL_ASK_SUGGESTIONS).toEqual(QUESTIONS);
    // Opening the drawer is not a question: no turn, no model run.
    expect(h.appendMessage).not.toHaveBeenCalled();
  });

  it("sends exactly one user turn when a question is clicked", async () => {
    await openEventDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Where is the meeting point?" }));
    await waitFor(() => expect(h.appendMessage).toHaveBeenCalledTimes(1));
    expect(h.appendMessage).toHaveBeenCalledWith("Where is the meeting point?");
  });

  it("does not duplicate the turn when the same question is clicked twice before it starts", async () => {
    let finish!: (saved: boolean) => void;
    h.appendMessage.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    await openEventDrawer();
    const chip = screen.getByRole("button", { name: "Are tickets available?" });
    // Two clicks in the same tick: the in-flight guard must accept only the first.
    act(() => { chip.click(); chip.click(); });
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
    act(() => { finish(true); });
  });

  it("hides the questions while a reply is in flight", async () => {
    h.appendMessage.mockReturnValue(new Promise<boolean>(() => {
      // Intentionally never settles: the reply stays in flight for this test.
    }));
    const group = await openEventDrawer();
    await userEvent.click(within(group).getByRole("button", { name: "When does it start?" }));
    await waitFor(() => expect(screen.queryByTestId("discovery-ask-suggestions")).toBeNull());
    expect(screen.getByTestId("discovery-ask-stop")).toBeTruthy();
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps guests on the existing sign-in state with no questions", async () => {
    h.user = null;
    render(<AskMdeSheet />);
    act(() => { openAskMde(); });
    expect(await screen.findByText("Sign in to ask about events.")).toBeTruthy();
    expect(screen.queryByTestId("discovery-ask-suggestions")).toBeNull();
    expect(h.appendMessage).not.toHaveBeenCalled();
  });

  it("is keyboard reachable: the chip takes focus and Enter sends one turn", async () => {
    await openEventDrawer();
    const chip = screen.getByRole("button", { name: "When does it start?" });
    chip.focus();
    expect(document.activeElement).toBe(chip);
    // jsdom has no layout, so the 44px target is asserted on the shared token the
    // composer already uses for its other touch targets (min-h-11 = 2.75rem).
    expect(chip.className).toContain("min-h-11");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(h.appendMessage).toHaveBeenCalledWith("When does it start?"));
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("offers no event questions on another page's drawer", async () => {
    h.pathname = "/restaurants/41d0b0aa-0000-4000-8000-000000000001";
    render(<AskMdeSheet />);
    await userEvent.click(screen.getByTestId("ask-mde-launcher"));
    expect(await screen.findByTestId("discovery-ask-input")).toBeTruthy();
    expect(screen.queryByTestId("discovery-ask-suggestions")).toBeNull();
    expect(screen.queryByRole("button", { name: "Are tickets available?" })).toBeNull();
  });
});
