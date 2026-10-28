// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  appendMessage: vi.fn(),
  stopActiveRun: vi.fn(),
  latestResult: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/restaurants" }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: h.user, loading: false }) }));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));
const agent = { messages: [], isRunning: false, subscribe: () => ({ unsubscribe: () => {} }) };
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useOptionalConciergeCoAgent: () => ({ agent, isReady: true }),
  useConciergeCoAgent: () => ({ agent, isReady: true }),
}));
vi.mock("@/components/rentals/rental-ask-tool-results", () => ({ useTurns: () => [] }));
vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({
    appendMessage: h.appendMessage, stopActiveRun: h.stopActiveRun, isLoading: false, isRuntimeUnavailable: () => false,
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
  h.latestResult.mockReset().mockReturnValue(result);
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
    expect(screen.queryByRole("alert")).toBeNull();
    expect(input().value).toBe("");
  });

  it("tells the visitor when the server fails mid-reply instead of showing nothing, and publishes no results", async () => {
    // CopilotKit reports a failed stream through the error store and still resolves runAgent.
    h.appendMessage.mockImplementation(async () => { reportConciergeError("thread-1"); return true; });
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
});
