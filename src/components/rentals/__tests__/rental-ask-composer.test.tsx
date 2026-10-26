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
  messages: [] as Array<{
    id: string;
    role: string;
    content?: string;
    toolName?: string;
    toolCallId?: string;
    toolCalls?: unknown;
  }>,
  listeners: [] as Array<() => void>,
}));
const coagent = vi.hoisted(() => ({ present: true, isReady: true, setState: vi.fn() }));
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
    useConciergeCoAgent: () => ({ agent: liveAgent, isReady: coagent.isReady, setState: coagent.setState }),
    useOptionalConciergeCoAgent: () =>
      coagent.present ? { agent: liveAgent, isReady: coagent.isReady, setState: coagent.setState } : null,
  };
});
vi.mock("@/hooks/use-session", () => ({ useSession: () => session }));
vi.mock("@/lib/concierge-error-store", () => ({
  getConciergeErrorVersion: () => errorVersion.value,
}));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));

import { RentalAskComposer, type RentalAskDetailsOutcome } from "../rental-ask-composer";

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

/** A row with every required `rentalSchema` field, so the browser-side validator accepts it. */
function rental(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Apartment ${id}`,
    neighborhood: "Laureles",
    nightly_price: 120_000,
    currency: "COP",
    bedrooms: 2,
    wifi: true,
    amenities: ["balcony"],
    image: "https://example.com/photo.jpg",
    source_url: "https://example.com/listing",
    can_schedule_viewing: true,
    schedule_viewing_url: null,
    host_name: "MDE",
    availability: "available",
    tags: [],
    ...overrides,
  };
}

beforeEach(() => {
  chat.appendMessage.mockReset().mockResolvedValue(true);
  chat.stopActiveRun.mockReset();
  chat.isLoading = false;
  session.user = { id: "user-1" };
  session.loading = false;
  coagent.present = true;
  coagent.isReady = true;
  coagent.setState.mockReset();
  nav.pathname = "/rentals";
  nav.search = "";
  agent.messages = [];
  agent.listeners = [];
  errorVersion.value = 0;
});

afterEach(cleanup);

describe("RentalAskComposer (SAN-1421)", () => {
  it("opens the first apartment locally for the exact details command, without a model search", async () => {
    const onResults = vi.fn();
    const onOpenDetails = vi.fn((): RentalAskDetailsOutcome => ({ ok: true }));
    render(<RentalAskComposer onResults={onResults} onOpenDetails={onOpenDetails} />);
    type("Show me the details.");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    expect(onOpenDetails).toHaveBeenCalledWith({ index: 1 });
    expect(chat.appendMessage).not.toHaveBeenCalled();
    expect(onResults).not.toHaveBeenCalled();
    await waitFor(() => expect(draftValue()).toBe(""));
  });

  it("opens the named position and refuses a position that is not on the page", async () => {
    const onOpenDetails = vi.fn(
      (target: { index?: number }): RentalAskDetailsOutcome =>
        target.index === 2
          ? { ok: true }
          : { ok: false, message: `There is no apartment ${target.index} in the current results.` },
    );
    render(<RentalAskComposer onOpenDetails={onOpenDetails} />);

    type("Show me the details for the second apartment.");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    expect(onOpenDetails).toHaveBeenCalledWith({ index: 2 });
    expect(chat.appendMessage).not.toHaveBeenCalled();

    type("Show me the details for the tenth apartment.");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    expect(onOpenDetails).toHaveBeenLastCalledWith({ index: 10 });
    expect(await screen.findByTestId("rental-ask-error")).not.toBeNull();
    expect(screen.getByTestId("rental-ask-error").textContent).toContain("There is no apartment 10");
    expect(chat.appendMessage).not.toHaveBeenCalled();
  });

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

  it("reports an answer that failed after it started, without offering a duplicate send", async () => {
    chat.appendMessage.mockImplementationOnce(async () => {
      errorVersion.value = 1;
      return true;
    });
    render(<RentalAskComposer />);
    type("2BR in Envigado");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    const alert = await screen.findByTestId("rental-ask-error");
    // The turn is already in the thread; restoring it here would resend the same question.
    expect(alert.textContent).toContain("in the conversation");
    expect(draftValue()).toBe("");
    // Once a user turn is already saved, Retry is not a valid action — even if
    // someone begins typing a new question in the composer.
    expect(screen.queryByTestId("rental-ask-retry")).toBeNull();
    type("Different question");
    expect(screen.queryByTestId("rental-ask-retry")).toBeNull();
  });

  it("frees the box while the answer streams, so the next question cannot join the sent one", async () => {
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    render(<RentalAskComposer />);

    type("cheaper 2BR");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    expect(draftValue()).toBe("");

    type("only in Laureles");
    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });
    expect(draftValue()).toBe("only in Laureles");
  });

  it("does not send while an IME candidate is still being composed", () => {
    render(<RentalAskComposer />);
    type("さくら");
    fireEvent.keyDown(screen.getByLabelText("Ask MDE about rentals"), { key: "Enter", isComposing: true });
    expect(chat.appendMessage).not.toHaveBeenCalled();
  });

  it("allows only one agent run on rapid repeated Enter presses", async () => {
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    render(<RentalAskComposer />);
    type("2BR in Laureles");
    const field = screen.getByLabelText("Ask MDE about rentals");
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(chat.appendMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("rental-ask-stop")).not.toBeNull();
    await act(async () => { pending.resolve(true); await pending.promise; });
    expect(draftValue()).toBe("");
  });

  it("does not bring the text back when a run is stopped and later resolves", async () => {
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    render(<RentalAskComposer />);
    type("two bedrooms near metro");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    fireEvent.click(screen.getByTestId("rental-ask-stop"));
    expect(chat.stopActiveRun).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(true); await pending.promise; });
    // The stopped turn is already in the conversation; restoring it would resend it twice.
    expect(draftValue()).toBe("");
    expect(screen.queryByTestId("rental-ask-error")).toBeNull();
  });

  it("blocks sending until the shared agent connection is ready", () => {
    coagent.isReady = false;
    render(<RentalAskComposer />);
    type("furnished flats");
    expect((screen.getByTestId("rental-ask-send") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Connecting to MDE");
    fireEvent.keyDown(screen.getByLabelText("Ask MDE about rentals"), { key: "Enter" });
    expect(chat.appendMessage).not.toHaveBeenCalled();
  });

  it("updates the page's cards from the same structured search the chat fast path uses", async () => {
    const onResults = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ results: [rental("rnt_1", { amenities: ["Balcony"] })], total: 1 }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<RentalAskComposer onResults={onResults} />);
    type("2 bedroom in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));
    // The same envelope reaches the agent, so its answer and the cards share one result set.
    const statePatch = coagent.setState.mock.calls
      .map(([patch]) => (typeof patch === "function" ? patch({}) : patch))
      .find((next) => Array.isArray(next.lastRentalResults));
    expect(statePatch?.lastRentalResults).toHaveLength(1);
    expect(statePatch?.lastRentalResults?.[0]?.id).toBe("rnt_1");
    // Amenities travel verbatim, so the answer can say "balcony" only when the listing does.
    expect(statePatch?.lastRentalResults?.[0]?.amenities).toEqual(["Balcony"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/rentals/search");
    expect(JSON.parse(String(init.body)).neighborhood).toBe("Laureles");
    expect(onResults).toHaveBeenCalledWith(
      expect.objectContaining({ query: "2 bedroom in Laureles", total: 1 }),
    );
    // The conversation still runs, so the same question and answer persist on /chat.
    await waitFor(() => expect(chat.appendMessage).toHaveBeenCalledWith("2 bedroom in Laureles"));
    vi.unstubAllGlobals();
  });

  it("lets a follow-up refine the previous rental question instead of starting over", async () => {
    // A Response body can only be read once, so each request gets its own.
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ results: [rental("rnt_1", { amenities: ["Balcony"] })], total: 1 }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onResults = vi.fn();

    render(<RentalAskComposer onResults={onResults} />);
    type("2 bedroom in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));

    // Let the first send leave the in-flight lock before asking the follow-up.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    type("only under COP 3 million");
    expect(draftValue()).toBe("only under COP 3 million");
    expect((screen.getByTestId("rental-ask-send") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(2));

    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(firstInit.body)).neighborhood).toBe("Laureles");
    // "only under 3M" carries no neighborhood of its own: it refines the Laureles search.
    expect(JSON.parse(String(secondInit.body)).neighborhood).toBe("Laureles");
    vi.unstubAllGlobals();
  });

  it("tells the agent which filters and apartment the renter is looking at", async () => {
    render(
      <RentalAskComposer
        context={{ neighborhood: "Laureles", beds: "2", selectedListingId: "rnt_9" }}
      />,
    );
    type("which of these has a balcony?");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    await waitFor(() => expect(coagent.setState).toHaveBeenCalled());
    const patch = coagent.setState.mock.calls[0][0];
    const next = typeof patch === "function" ? patch({}) : patch;
    expect(next.lastRentalQuery).toMatchObject({ neighborhood: "Laureles", minBedrooms: 2 });
    expect(next.selectedListingId).toBe("rnt_9");
    // The question still goes to the same thread.
    await waitFor(() => expect(chat.appendMessage).toHaveBeenCalledWith("which of these has a balcony?"));
    vi.unstubAllGlobals();
  });

  it("takes the cards from the agent's own rental tool result, with no second search", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onResults = vi.fn();
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    render(<RentalAskComposer onResults={onResults} />);
    type("2 bedroom in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    await act(async () => {
      agent.messages = [
        { id: "u1", role: "user", content: "2 bedroom in Laureles" },
        {
          id: "a1",
          role: "assistant",
          toolCalls: [{ id: "call-1", type: "function", function: { name: "searchRentalsTool" } }],
        },
        {
          id: "t1",
          role: "tool",
          toolCallId: "call-1",
          content: JSON.stringify({
            results: [
              rental("rnt_1", { amenities: ["Balcony", "Wi-Fi"] }),
              rental("rnt_2", { amenities: [] }),
            ],
            budgetNote: "No monthly budget applied",
          }),
        },
      ];
      agent.listeners.forEach((listener) => listener());
    });

    expect(onResults).toHaveBeenCalledTimes(1);
    expect(onResults).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "2 bedroom in Laureles",
        total: 2,
        budgetNotice: "No monthly budget applied",
        results: [expect.objectContaining({ id: "rnt_1" }), expect.objectContaining({ id: "rnt_2" })],
      }),
    );
    // The page must not run a second, independent search when the agent already produced the rows.
    expect(fetchMock).not.toHaveBeenCalled();
    // Amenities reach working memory verbatim: a documented balcony stays, an empty list does not
    // become "no balcony" (it stays empty, which the answer must read as "not specified").
    const patch = coagent.setState.mock.calls
      .map(([value]) => (typeof value === "function" ? value({}) : value))
      .find((next) => Array.isArray(next.lastRentalResults));
    expect(patch?.lastRentalResults?.[0]?.amenities).toEqual(["Balcony", "Wi-Fi"]);
    expect(patch?.lastRentalResults?.[1]?.amenities).toEqual([]);
    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });
    vi.unstubAllGlobals();
  });

  it("ignores a tool result that arrives after the renter stopped the answer", async () => {
    const onResults = vi.fn();
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    render(<RentalAskComposer onResults={onResults} />);
    type("2 bedroom in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    fireEvent.click(screen.getByTestId("rental-ask-stop"));

    await act(async () => {
      agent.messages = [
        { id: "u1", role: "user", content: "2 bedroom in Laureles" },
        {
          id: "a1",
          role: "assistant",
          toolCalls: [{ id: "call-1", type: "function", function: { name: "searchRentalsTool" } }],
        },
        { id: "t1", role: "tool", toolCallId: "call-1", content: JSON.stringify({ results: [rental("rnt_1")] }) },
      ];
      agent.listeners.forEach((listener) => listener());
    });

    expect(onResults).not.toHaveBeenCalled();
  });

  it("keeps the current answer when a follow-up produces no rental tool result", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onResults = vi.fn();
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    render(<RentalAskComposer onResults={onResults} />);

    // First question: the agent's tool result becomes the answer.
    type("2 bedroom in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    await act(async () => {
      agent.messages = [
        { id: "u1", role: "user", content: "2 bedroom in Laureles" },
        { id: "a1", role: "assistant", toolCalls: [{ id: "call-1", function: { name: "searchRentalsTool" } }] },
        {
          id: "t1",
          role: "tool",
          toolCallId: "call-1",
          content: JSON.stringify({ results: [rental("rnt_1")] }),
        },
      ];
      agent.listeners.forEach((listener) => listener());
    });
    expect(onResults).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });

    // Follow-up: a conversational answer with no tool call. The list must not be replaced by a
    // fresh search of the question itself (live, this turned 8 apartments into 32).
    await act(async () => {
      agent.messages = [
        ...agent.messages,
        { id: "u2", role: "user", content: "which of these has a balcony?" },
        { id: "a2", role: "assistant", content: "The listing details do not specify a balcony." },
      ];
      agent.listeners.forEach((listener) => listener());
    });
    type("which of these has a balcony?");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    await waitFor(() => expect(chat.appendMessage).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    expect(onResults).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps the current rows after a fallback search when the next turn only asks about amenities", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ results: [rental("rnt_1", { amenities: ["Balcony"] })], total: 1 }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onResults = vi.fn();
    render(<RentalAskComposer onResults={onResults} />);

    // First agent reply has no tool result: structured fallback legitimately fills the page,
    // and remembers Laureles/2 bedrooms for the next turn.
    type("2 bedroom in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A question about THESE rows adds no new filter. The old parameters must not turn it
    // into a second catalogue search simply because the parser inherits previous filters.
    type("which of these has a balcony?");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    await waitFor(() => expect(chat.appendMessage).toHaveBeenCalledTimes(2));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onResults).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("shows a failed rental search but still asks the concierge", async () => {
    const onResults = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));

    render(<RentalAskComposer onResults={onResults} />);
    type("studio in Envigado");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    const alert = await screen.findByTestId("rental-ask-error");
    expect(alert.textContent).toContain("temporarily unavailable");
    expect(onResults).not.toHaveBeenCalled();
    expect(chat.appendMessage).toHaveBeenCalledWith("studio in Envigado");
    vi.unstubAllGlobals();
  });

  it("continues the concierge turn if the supplementary rental fetch loses network", async () => {
    const onResults = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(<RentalAskComposer onResults={onResults} />);
    type("2 bedrooms in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    const alert = await screen.findByTestId("rental-ask-error");
    expect(alert.textContent).toContain("temporarily unavailable");
    await waitFor(() => expect(chat.appendMessage).toHaveBeenCalledWith("2 bedrooms in Laureles"));
    expect(onResults).not.toHaveBeenCalled();
    expect(screen.queryByTestId("rental-ask-retry")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("does not run the fallback search after the renter stopped the answer", async () => {
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    const onResults = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RentalAskComposer onResults={onResults} />);
    type("2 bedrooms in Envigado");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    fireEvent.click(screen.getByTestId("rental-ask-stop"));
    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onResults).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not propose duplicate Retry when the agent send rejects after dispatch", async () => {
    chat.appendMessage.mockRejectedValueOnce(new Error("stream failed"));
    render(<RentalAskComposer />);
    type("furnished studio");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    const alert = await screen.findByTestId("rental-ask-error");
    expect(alert.textContent).toContain("in the conversation");
    expect(draftValue()).toBe("");
    expect(screen.queryByTestId("rental-ask-retry")).toBeNull();
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

  it("refuses a malformed 200 row instead of putting it on the page", async () => {
    const onResults = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: [{ id: "rnt_1" }], total: 1 }), { status: 200 }),
      ),
    );
    render(<RentalAskComposer onResults={onResults} />);
    type("2BR in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    const alert = await screen.findByTestId("rental-ask-error");
    expect(alert.textContent).toContain("Could not search rentals");
    expect(onResults).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refuses a 200 whose total is not a valid count", async () => {
    const onResults = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: [rental("rnt_1")], total: -1 }), { status: 200 }),
      ),
    );
    render(<RentalAskComposer onResults={onResults} />);
    type("2BR in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    expect(await screen.findByTestId("rental-ask-error")).not.toBeNull();
    expect(onResults).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it.each([
    [401, "session has expired"],
    [403, "cannot search rentals"],
    [429, "Too many questions"],
  ])("turns HTTP %i into an access message the renter can act on", async (status, message) => {
    const onResults = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    render(<RentalAskComposer onResults={onResults} />);
    type("2BR in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    expect((await screen.findByTestId("rental-ask-error")).textContent).toContain(message);
    expect(onResults).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("cancels the supplementary search when the answer is stopped", async () => {
    const onResults = vi.fn();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RentalAskComposer onResults={onResults} />);
    type("2BR in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("rental-ask-stop"));

    expect(signal?.aborted).toBe(true);
    expect(onResults).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("starts the first structured search from the filters the page already has", async () => {
    const onResults = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [rental("rnt_1")], total: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RentalAskComposer
        onResults={onResults}
        context={{
          neighborhood: "Laureles",
          beds: "2",
          from: "2026-11-01",
          through: "2026-11-30",
          selectedListingId: "rnt_9",
        }}
      />,
    );
    // A refinement with no new filters of its own must keep the page's neighborhood, size and dates.
    type("something cheaper");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      neighborhood: "Laureles",
      minBedrooms: 2,
      checkIn: "2026-11-01",
      checkOut: "2026-11-30",
    });
    vi.unstubAllGlobals();
  });

  it("names a request the rental search cannot filter instead of implying it applied", async () => {
    const onResults = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: [rental("rnt_1")], total: 1 }), { status: 200 }),
      ),
    );
    render(<RentalAskComposer onResults={onResults} />);
    type("furnished 2BR in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));
    expect(onResults.mock.calls[0][0].budgetNotice).toContain("can't filter by furnished");
    vi.unstubAllGlobals();
  });

  it("passes the tool's own unapplied requests through to the cards", async () => {
    const onResults = vi.fn();
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    render(<RentalAskComposer onResults={onResults} />);
    type("pet friendly 2BR in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    await act(async () => {
      agent.messages = [
        { id: "u1", role: "user", content: "pet friendly 2BR in Laureles" },
        {
          id: "a1",
          role: "assistant",
          toolCalls: [{ id: "call-1", type: "function", function: { name: "searchRentalsTool" } }],
        },
        {
          id: "t1",
          role: "tool",
          toolCallId: "call-1",
          content: JSON.stringify({ results: [rental("rnt_1")], unappliedRequests: ["pet-friendly"] }),
        },
      ];
      agent.listeners.forEach((listener) => listener());
    });

    expect(onResults).toHaveBeenCalledWith(
      expect.objectContaining({ budgetNotice: expect.stringContaining("can't filter by pet-friendly") }),
    );
    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });
  });

  it("names an unapplied request from the question even when the tool omitted it", async () => {
    const onResults = vi.fn();
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    render(<RentalAskComposer onResults={onResults} />);
    type("furnished 2BR in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    await act(async () => {
      agent.messages = [
        { id: "u1", role: "user", content: "furnished 2BR in Laureles" },
        {
          id: "a1",
          role: "assistant",
          toolCalls: [{ id: "call-1", type: "function", function: { name: "searchRentalsTool" } }],
        },
        {
          id: "t1",
          role: "tool",
          toolCallId: "call-1",
          content: JSON.stringify({ results: [rental("rnt_1")] }),
        },
      ];
      agent.listeners.forEach((listener) => listener());
    });

    expect(onResults).toHaveBeenCalledWith(
      expect.objectContaining({ budgetNotice: expect.stringContaining("can't filter by furnished") }),
    );
    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });
  });

  it("keeps a prior unsupported request visible after a refinement", async () => {
    const onResults = vi.fn();
    const first = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(first.promise);
    render(<RentalAskComposer onResults={onResults} />);
    type("furnished 2BR in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    await act(async () => {
      agent.messages = [
        { id: "u1", role: "user", content: "furnished 2BR in Laureles" },
        {
          id: "a1",
          role: "assistant",
          toolCalls: [{ id: "call-1", type: "function", function: { name: "searchRentalsTool" } }],
        },
        {
          id: "t1",
          role: "tool",
          toolCallId: "call-1",
          content: JSON.stringify({ results: [rental("rnt_1")] }),
        },
      ];
      agent.listeners.forEach((listener) => listener());
    });
    expect(onResults).toHaveBeenCalledWith(
      expect.objectContaining({ budgetNotice: expect.stringContaining("can't filter by furnished") }),
    );
    await act(async () => {
      first.resolve(true);
      await first.promise;
    });

    // Refinement names only the budget. The furnishing request is still not filtered.
    const second = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(second.promise);
    type("only under COP 3 million");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    await act(async () => {
      agent.messages = [
        ...agent.messages,
        { id: "u2", role: "user", content: "only under COP 3 million" },
        {
          id: "a2",
          role: "assistant",
          toolCalls: [{ id: "call-2", type: "function", function: { name: "searchRentalsTool" } }],
        },
        {
          id: "t2",
          role: "tool",
          toolCallId: "call-2",
          content: JSON.stringify({ results: [rental("rnt_2")] }),
        },
      ];
      agent.listeners.forEach((listener) => listener());
    });

    const latest = onResults.mock.calls.at(-1)?.[0];
    expect(latest?.budgetNotice).toContain("can't filter by furnished");
    await act(async () => {
      second.resolve(true);
      await second.promise;
    });
  });

  it("merges carried labels with an unsupported request named by the refinement", async () => {
    const onResults = vi.fn();
    const first = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(first.promise);
    render(<RentalAskComposer onResults={onResults} />);
    type("furnished 2BR in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    await act(async () => {
      agent.messages = [
        { id: "u1", role: "user", content: "furnished 2BR in Laureles" },
        {
          id: "a1",
          role: "assistant",
          toolCalls: [{ id: "call-1", type: "function", function: { name: "searchRentalsTool" } }],
        },
        {
          id: "t1",
          role: "tool",
          toolCallId: "call-1",
          content: JSON.stringify({ results: [rental("rnt_1")] }),
        },
      ];
      agent.listeners.forEach((listener) => listener());
    });
    await act(async () => {
      first.resolve(true);
      await first.promise;
    });

    const second = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(second.promise);
    type("only under COP 3 million, and pet friendly");
    fireEvent.click(screen.getByTestId("rental-ask-send"));
    await act(async () => {
      agent.messages = [
        ...agent.messages,
        { id: "u2", role: "user", content: "only under COP 3 million, and pet friendly" },
        {
          id: "a2",
          role: "assistant",
          toolCalls: [{ id: "call-2", type: "function", function: { name: "searchRentalsTool" } }],
        },
        {
          id: "t2",
          role: "tool",
          toolCallId: "call-2",
          content: JSON.stringify({
            results: [rental("rnt_2")],
            unappliedRequests: ["pet-friendly"],
          }),
        },
      ];
      agent.listeners.forEach((listener) => listener());
    });

    const latest = onResults.mock.calls.at(-1)?.[0];
    // The refinement's own notice must not erase the earlier furnishing request.
    expect(latest?.budgetNotice).toContain("furnished");
    expect(latest?.budgetNotice).toContain("pet-friendly");
    expect(latest?.unappliedRequests).toEqual(expect.arrayContaining(["furnished", "pet-friendly"]));
    await act(async () => {
      second.resolve(true);
      await second.promise;
    });
  });

  it("ignores a tool result with a row that is not a real rental", async () => {
    const onResults = vi.fn();
    const pending = deferred<boolean>();
    chat.appendMessage.mockReturnValueOnce(pending.promise);
    render(<RentalAskComposer onResults={onResults} />);
    type("2BR in Laureles");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    await act(async () => {
      agent.messages = [
        { id: "u1", role: "user", content: "2BR in Laureles" },
        {
          id: "a1",
          role: "assistant",
          toolCalls: [{ id: "call-1", type: "function", function: { name: "searchRentalsTool" } }],
        },
        {
          id: "t1",
          role: "tool",
          toolCallId: "call-1",
          content: JSON.stringify({ results: [{ id: "rnt_1" }] }),
        },
      ];
      agent.listeners.forEach((listener) => listener());
    });

    expect(onResults).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });
  });

  it("does not let a run from the previous filters replace the remounted page's cards", async () => {
    // A filter change remounts the workspace. The old question's answer may still be streaming;
    // it belongs to the old filters and must not rewrite the new page's list.
    const onResults = vi.fn();
    render(<RentalAskComposer onResults={onResults} />);

    await act(async () => {
      agent.messages = [
        { id: "u1", role: "user", content: "2BR in Envigado" },
        {
          id: "a1",
          role: "assistant",
          toolCalls: [{ id: "call-1", type: "function", function: { name: "searchRentalsTool" } }],
        },
        {
          id: "t1",
          role: "tool",
          toolCallId: "call-1",
          content: JSON.stringify({ results: [rental("rnt_1")] }),
        },
      ];
      agent.listeners.forEach((listener) => listener());
    });

    expect(onResults).not.toHaveBeenCalled();
  });

  it("stops an in-flight answer when a filter change unmounts the page", () => {
    chat.isLoading = true;
    const { unmount } = render(<RentalAskComposer onResults={vi.fn()} />);
    unmount();
    expect(chat.stopActiveRun).toHaveBeenCalledTimes(1);
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
