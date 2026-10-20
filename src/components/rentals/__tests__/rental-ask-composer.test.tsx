// @vitest-environment jsdom
/**
 * SAN-1421 — the in-column "Ask MDE" composer.
 *
 * What this proves: one press sends one message on the existing thread, an answer that fails keeps the
 * text (including anything typed while waiting), Retry resends it, a running answer can be stopped, a
 * signed-out visitor is offered sign-in without losing the current filters, the transcript follows the
 * agent's live messages, and the box publishes its height for the phone Map button.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const chat = vi.hoisted(() => ({
  appendMessage: vi.fn(() => Promise.resolve(true)),
  isLoading: false,
  stopActiveRun: vi.fn(),
}));
const session = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  loading: false,
}));
const agent = vi.hoisted(() => ({
  messages: [] as Array<{ id: string; role: string; content: string }>,
  listeners: [] as Array<() => void>,
}));
const coagent = vi.hoisted(() => ({ present: true }));
const nav = vi.hoisted(() => ({ pathname: "/rentals", search: "" }));
const errorVersion = vi.hoisted(() => ({ value: 0 }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({
    appendMessage: chat.appendMessage,
    isLoading: chat.isLoading,
    stopActiveRun: chat.stopActiveRun,
  }),
}));
vi.mock("@/components/chat/concierge-coagent-context", () => {
  // One stable object, like the real provider's agent: a fresh object per render would re-subscribe forever.
  const liveAgent = {
    get messages() {
      return agent.messages;
    },
    subscribe: (subscriber: { onMessagesChanged?: () => void }) => {
      if (subscriber.onMessagesChanged) agent.listeners.push(subscriber.onMessagesChanged);
      return { unsubscribe: () => { agent.listeners = []; } };
    },
  };
  return {
    useConciergeCoAgent: () => ({ agent: liveAgent }),
    useOptionalConciergeCoAgent: () => (coagent.present ? { agent: liveAgent } : null),
  };
});
vi.mock("@/hooks/use-session", () => ({ useSession: () => session }));
vi.mock("@/lib/concierge-error-store", () => ({
  getConciergeErrorVersion: () => errorVersion.value,
}));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));

import { RentalAskComposer } from "../rental-ask-composer";

function type(text: string) {
  fireEvent.change(screen.getByLabelText("Ask MDE about rentals"), { target: { value: text } });
}
function draftValue() {
  return (screen.getByLabelText("Ask MDE about rentals") as HTMLTextAreaElement).value;
}
/** A promise the test resolves by hand, to type while a send is still in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  chat.appendMessage.mockReset().mockResolvedValue(true);
  chat.stopActiveRun.mockReset();
  chat.isLoading = false;
  session.user = { id: "user-1" };
  session.loading = false;
  coagent.present = true;
  nav.pathname = "/rentals";
  nav.search = "";
  agent.messages = [];
  agent.listeners = [];
  errorVersion.value = 0;
});

afterEach(cleanup);

describe("RentalAskComposer (SAN-1421)", () => {
  it("sends one message on Enter and clears the box on success", async () => {
    render(<RentalAskComposer />);
    type("  cheaper two-bedroom apartments in Laureles  ");
    fireEvent.keyDown(screen.getByLabelText("Ask MDE about rentals"), { key: "Enter" });

    await waitFor(() => expect(chat.appendMessage).toHaveBeenCalledTimes(1));
    expect(chat.appendMessage).toHaveBeenCalledWith("cheaper two-bedroom apartments in Laureles");
    await waitFor(() => expect(draftValue()).toBe(""));
  });

  it("keeps Shift+Enter as a newline instead of sending", () => {
    render(<RentalAskComposer />);
    type("only in Laureles");
    fireEvent.keyDown(screen.getByLabelText("Ask MDE about rentals"), { key: "Enter", shiftKey: true });
    expect(chat.appendMessage).not.toHaveBeenCalled();
  });

  it("keeps the question when the answer fails, and Retry sends it again", async () => {
    chat.appendMessage.mockResolvedValueOnce(false);
    render(<RentalAskComposer />);
    type("does this one have a balcony?");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    const alert = await screen.findByTestId("rental-ask-error");
    expect(alert.textContent).toContain("Your question is still here");
    expect(draftValue()).toBe("does this one have a balcony?");

    chat.appendMessage.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByTestId("rental-ask-retry"));
    await waitFor(() => expect(chat.appendMessage).toHaveBeenCalledTimes(2));
    expect(chat.appendMessage).toHaveBeenLastCalledWith("does this one have a balcony?");
  });

  it("does not wipe what the user typed while the answer was still running", async () => {
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    render(<RentalAskComposer />);

    type("cheaper 2BR");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    // Still waiting: the user starts the next question.
    type("cheaper 2BR, only in Laureles");

    await act(async () => {
      pending.resolve(false);
      await pending.promise;
    });

    expect(await screen.findByTestId("rental-ask-error")).not.toBeNull();
    expect(draftValue()).toBe("cheaper 2BR, only in Laureles");
  });

  it("reports an answer that failed after it started, using CopilotKit's error signal", async () => {
    chat.appendMessage.mockImplementationOnce(async () => {
      errorVersion.value = 1;
      return true;
    });
    render(<RentalAskComposer />);
    type("2BR in Envigado");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    expect(await screen.findByTestId("rental-ask-error")).not.toBeNull();
    expect(draftValue()).toBe("2BR in Envigado");
  });

  it("offers Stop while an answer is running", () => {
    chat.isLoading = true;
    render(<RentalAskComposer />);
    fireEvent.click(screen.getByTestId("rental-ask-stop"));
    expect(chat.stopActiveRun).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("rental-ask-send")).toBeNull();
  });

  it("keeps the current filters when asking a signed-out visitor to sign in", () => {
    session.user = null;
    nav.search = "neighborhood=Laureles&beds=2";
    render(<RentalAskComposer />);

    const link = screen.getByRole("link", { name: "Sign in" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `/login?next=${encodeURIComponent("/rentals?neighborhood=Laureles&beds=2")}`,
    );
    expect(screen.queryByTestId("rental-ask-send")).toBeNull();
  });

  it("renders an inert box, with no send, where no concierge provider is mounted", () => {
    coagent.present = false;
    render(<RentalAskComposer />);
    expect(screen.getByTestId("rental-ask-inert")).not.toBeNull();
    expect(screen.queryByTestId("rental-ask-send")).toBeNull();
    expect(screen.queryByLabelText("Ask MDE about rentals")).toBeNull();
  });

  it("updates the transcript from the agent's live messages, not just the first render", async () => {
    render(<RentalAskComposer />);
    expect(screen.queryByTestId("rental-ask-transcript")).toBeNull();

    await act(async () => {
      agent.messages.push({ id: "u1", role: "user", content: "cheaper 2BR in Laureles" });
      agent.messages.push({ id: "a1", role: "assistant", content: "Here are three under 3M COP." });
      agent.listeners.forEach((listener) => listener());
    });

    fireEvent.click(screen.getByTestId("rental-ask-toggle-transcript"));
    const transcript = screen.getByTestId("rental-ask-transcript");
    expect(transcript.textContent).toContain("cheaper 2BR in Laureles");
    expect(transcript.textContent).toContain("Here are three under 3M COP.");
  });

  it("publishes its rendered height so the phone Map button can clear it", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 320,
      width: 390,
      top: 0,
      bottom: 320,
      left: 0,
      right: 390,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(<RentalAskComposer />);
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--mde-ask-composer-height")).toBe("320px"),
    );

    cleanup();
    expect(document.documentElement.style.getPropertyValue("--mde-ask-composer-height")).toBe("");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
