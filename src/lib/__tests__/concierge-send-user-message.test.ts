import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearConciergeError, getConciergeErrorSnapshot } from "@/lib/concierge-error-store";
import { sendConciergeUserMessage } from "../concierge-send-user-message";

function makeHandlers() {
  return {
    threadId: undefined as string | undefined,
    closeRentalDetails: vi.fn(),
    retryLastTurn: undefined as (() => Promise<boolean>) | undefined,
    handleRentalMessage: vi.fn<(text: string, submissionId?: string) => Promise<boolean>>(async () => false),
    handleEventVenueBookingMessage: vi.fn<(text: string, submissionId?: string) => Promise<boolean>>(async () => false),
    handleEventMessage: vi.fn<(text: string, submissionId?: string) => Promise<boolean>>(async () => false),
    handleGroundedMessage: vi.fn<(text: string, submissionId?: string) => Promise<boolean>>(async () => false),
    handleRestaurantMessage: vi.fn<(text: string, submissionId?: string) => Promise<boolean>>(async () => false),
    onAgentSend: vi.fn<(text: string, submissionId?: string) => Promise<boolean>>(async () => true),
  };
}

beforeEach(() => {
  clearConciergeError();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("SAN-867 · VEB-MVP-001 — Router hijack fix — sendConciergeUserMessage pipeline", () => {
  it("plan my weekend reaches agent without event fast-path", async () => {
    const handlers = makeHandlers();
    await sendConciergeUserMessage("plan my weekend", handlers);

    expect(handlers.onAgentSend).toHaveBeenCalledOnce();
    expect(handlers.onAgentSend).toHaveBeenCalledWith("plan my weekend", expect.any(String));
    expect(handlers.handleEventMessage).not.toHaveBeenCalled();
    expect(handlers.handleRentalMessage).not.toHaveBeenCalled();
  });

  it("what can I do tonight reaches agent without event fast-path", async () => {
    const handlers = makeHandlers();
    await sendConciergeUserMessage("what can I do tonight", handlers);

    expect(handlers.onAgentSend).toHaveBeenCalledOnce();
    expect(handlers.handleEventMessage).not.toHaveBeenCalled();
  });

  it("handled rental fast-path does not also run the agent", async () => {
    const handlers = makeHandlers();
    handlers.handleRentalMessage.mockResolvedValueOnce(true);

    await sendConciergeUserMessage("search top 5 rentals laureles", handlers);

    expect(handlers.handleRentalMessage).toHaveBeenCalledOnce();
    expect(handlers.onAgentSend).not.toHaveBeenCalled();
  });

  it("venue booking still uses event_venue_booking handler", async () => {
    const handlers = makeHandlers();
    handlers.handleEventVenueBookingMessage.mockResolvedValueOnce(true);

    await sendConciergeUserMessage(
      "I need a venue for a birthday party for 30 people",
      handlers,
    );

    expect(handlers.handleEventVenueBookingMessage).toHaveBeenCalledOnce();
    expect(handlers.onAgentSend).not.toHaveBeenCalled();
  });

  it("SAN-1559 routes a second event search to the agent when its fast path is busy", async () => {
    const handlers = makeHandlers();
    let signalStarted!: () => void;
    let finishFirst!: (handled: boolean) => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    handlers.handleEventMessage
      .mockImplementationOnce(() => {
        signalStarted();
        return new Promise<boolean>((resolve) => { finishFirst = resolve; });
      })
      .mockResolvedValueOnce(false);

    const first = sendConciergeUserMessage("salsa events this weekend", handlers);
    await started;

    expect(await sendConciergeUserMessage("music events tonight", handlers)).toBe(true);
    expect(handlers.handleEventMessage).toHaveBeenCalledTimes(2);
    expect(handlers.onAgentSend).toHaveBeenCalledOnce();
    expect(handlers.onAgentSend).toHaveBeenCalledWith("music events tonight", expect.any(String));

    finishFirst(true);
    expect(await first).toBe(true);
    expect(handlers.onAgentSend).toHaveBeenCalledOnce();
  });

  it("retries the failed fast-path search, not the previous agent turn", async () => {
    const handlers = makeHandlers();
    handlers.threadId = "thread-a";
    handlers.handleEventMessage
      .mockRejectedValueOnce(new Error("event search failed"))
      .mockResolvedValueOnce(true);

    await sendConciergeUserMessage("salsa events this weekend", handlers);

    const failure = getConciergeErrorSnapshot();
    expect(failure.threadId).toBe("thread-a");
    expect(failure.retry).toBeTypeOf("function");
    await Promise.all([failure.retry?.(), failure.retry?.()]);
    expect(handlers.handleEventMessage).toHaveBeenCalledTimes(2);
    expect(handlers.onAgentSend).not.toHaveBeenCalled();
  });

  it("reuses one submission ID for a fast-path retry but creates a new ID for a deliberate repeat", async () => {
    const handlers = makeHandlers();
    handlers.threadId = "thread-a";
    handlers.handleEventMessage
      .mockRejectedValueOnce(new Error("transient event search failure"))
      .mockResolvedValue(true);

    await sendConciergeUserMessage("salsa events this weekend", handlers);
    const failure = getConciergeErrorSnapshot();
    await failure.retry?.();
    await sendConciergeUserMessage("salsa events this weekend", handlers);
    const ids = handlers.handleEventMessage.mock.calls.map((call) => call[1]);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it("uses the agent-turn retry for a failed agent send", async () => {
    const handlers = makeHandlers();
    handlers.threadId = "thread-a";
    handlers.retryLastTurn = vi.fn(async () => true);
    handlers.onAgentSend.mockRejectedValueOnce(new Error("agent failed"));

    await sendConciergeUserMessage("plan my weekend", handlers);

    const failure = getConciergeErrorSnapshot();
    expect(failure.threadId).toBe("thread-a");
    await failure.retry?.();
    expect(handlers.retryLastTurn).toHaveBeenCalledTimes(1);
  });

  it("salsa events still uses event handler before agent", async () => {
    const handlers = makeHandlers();
    handlers.handleEventMessage.mockResolvedValueOnce(true);

    await sendConciergeUserMessage("salsa events this weekend", handlers);

    expect(handlers.handleEventMessage).toHaveBeenCalledOnce();
    expect(handlers.onAgentSend).not.toHaveBeenCalled();
  });

  it("SAN-874 marks a signed-in coworking question as a topic switch before the next budget", async () => {
    const handlers = {
      ...makeHandlers(), inRentalSearch: true,
      onTopicShift: vi.fn<(intent: import("@/lib/router-intent").RouterIntent) => void>(),
      onAgentSend: vi.fn<(text: string, id?: string, onAccepted?: () => void, onCompleted?: () => void, onFailed?: () => void) => Promise<boolean>>(
        async (_text, _id, onAccepted, onCompleted) => {
          onAccepted?.();
          onCompleted?.();
          return true;
        },
      ),
    };
    await sendConciergeUserMessage("What coworking spaces are in Laureles?", handlers);
    expect(handlers.onTopicShift).toHaveBeenCalledTimes(2);
    expect(handlers.onTopicShift).toHaveBeenNthCalledWith(1, "general_concierge", "accepted");
    expect(handlers.onTopicShift).toHaveBeenNthCalledWith(2, "general_concierge", "completed");
    expect(handlers.onAgentSend).toHaveBeenCalledWith(
      "What coworking spaces are in Laureles?", expect.any(String), expect.any(Function), expect.any(Function), expect.any(Function),
    );
    expect(handlers.handleRentalMessage).not.toHaveBeenCalled();
  });

  it("SAN-874 rolls back topic intent when a coworking stream fails", async () => {
    const handlers = {
      ...makeHandlers(), inRentalSearch: true,
      onTopicShift: vi.fn(),
      onAgentSend: vi.fn(async (_text: string, _id?: string, onAccepted?: () => void,
        _onCompleted?: () => void, onFailed?: () => void) => {
        onAccepted?.();
        onFailed?.();
        return true;
      }),
    };
    await sendConciergeUserMessage("What coworking spaces are in Laureles?", handlers);
    expect(handlers.onTopicShift).toHaveBeenNthCalledWith(1, "general_concierge", "accepted");
    expect(handlers.onTopicShift).toHaveBeenNthCalledWith(2, "general_concierge", "failed");
  });

  it("SAN-874 keeps rental cards when a coworking agent turn did not start", async () => {
    const handlers = {
      ...makeHandlers(), inRentalSearch: true,
      onTopicShift: vi.fn(),
    };
    await sendConciergeUserMessage("What coworking spaces are in Laureles?", handlers);
    // A mock that never reports acceptance must not clear the old results.
    expect(handlers.onTopicShift).not.toHaveBeenCalled();
    expect(handlers.handleRentalMessage).not.toHaveBeenCalled();
  });

  it("SAN-874 does not clear rental state for a general question or Flash hint", async () => {
    const handlers = {
      ...makeHandlers(), inRentalSearch: true,
      onTopicShift: vi.fn(),
    };
    await sendConciergeUserMessage("Is Laureles safe at night?", handlers);
    expect(handlers.onTopicShift).not.toHaveBeenCalled();
  });

  describe("SAN-407 · INT-004 — a whole-city follow-up reaches the rental search", () => {
    it.each(["Anywhere is fine", "Anywhere in Medellín is fine", "any neighborhood works"])(
      "%j after a rental search is tried on the rental fast path before the assistant",
      async (text) => {
        const handlers = { ...makeHandlers(), lastIntent: "rental_search" as const };
        handlers.handleRentalMessage.mockResolvedValueOnce(true);

        await sendConciergeUserMessage(text, handlers);

        expect(handlers.handleRentalMessage).toHaveBeenCalledWith(text, expect.any(String));
        expect(handlers.onAgentSend).not.toHaveBeenCalled();
      },
    );

    it.each(["Is Medellín safe at night?", "Anywhere but El Poblado", "What is the weather anywhere in Medellín", "any neighborhood near a metro"])(
      "%j after a rental search is a different question and still goes to the assistant",
      async (text) => {
        const handlers = { ...makeHandlers(), lastIntent: "rental_search" as const };
        await sendConciergeUserMessage(text, handlers);

        expect(handlers.handleRentalMessage).not.toHaveBeenCalled();
        expect(handlers.onAgentSend).toHaveBeenCalledOnce();
      },
    );

    it("keeps explicit budget-only follow-ups on public rental search after a previous rental", async () => {
      const text = "Now only under COP 2.5 million per month";
      const handlers = { ...makeHandlers(), lastIntent: undefined, inRentalSearch: true };
      handlers.handleRentalMessage.mockResolvedValueOnce(true);
      await sendConciergeUserMessage(text, handlers);
      expect(handlers.handleRentalMessage).toHaveBeenCalledWith(text, expect.any(String));
      expect(handlers.onAgentSend).not.toHaveBeenCalled();
    });

    it("does not hijack cost questions for gyms or coworking from an earlier rental", async () => {
      const handlers = { ...makeHandlers(), inRentalSearch: true };
      for (const text of ["gym under COP 200k per month", "coworking under COP 800k per month"]) {
        await sendConciergeUserMessage(text, handlers);
      }
      expect(handlers.handleRentalMessage).not.toHaveBeenCalled();
      expect(handlers.onAgentSend).toHaveBeenCalledTimes(2);
    });

    it("uses inRentalSearch over lastIntent, so saved older conversations still widen", async () => {
      const handlers = { ...makeHandlers(), lastIntent: undefined, inRentalSearch: true };
      handlers.handleRentalMessage.mockResolvedValueOnce(true);
      await sendConciergeUserMessage("Anywhere is fine", handlers);

      expect(handlers.handleRentalMessage).toHaveBeenCalledOnce();
      expect(handlers.onAgentSend).not.toHaveBeenCalled();
    });

    it("without a rental search before it, the same words still go to the assistant", async () => {
      const handlers = makeHandlers();
      await sendConciergeUserMessage("Anywhere is fine", handlers);

      expect(handlers.handleRentalMessage).not.toHaveBeenCalled();
      expect(handlers.onAgentSend).toHaveBeenCalledOnce();
    });

    it("after an events search, whole-city words are not taken for a rental search", async () => {
      const handlers = { ...makeHandlers(), lastIntent: "event_discovery" as const };
      await sendConciergeUserMessage("Anywhere is fine", handlers);

      expect(handlers.handleRentalMessage).not.toHaveBeenCalled();
      expect(handlers.onAgentSend).toHaveBeenCalledOnce();
    });
  });
});

describe("SAN-106 contextual rental café routing", () => {
  it("tries grounded Nearby before rental classification when a rental is selected", async () => {
    const handlers = makeHandlers();
    handlers.handleGroundedMessage.mockResolvedValueOnce(true);
    const text = "Show cafés within 800 meters of this apartment";
    expect(await sendConciergeUserMessage(text, handlers)).toBe(true);
    expect(handlers.handleGroundedMessage).toHaveBeenCalledWith(text, expect.any(String));
    expect(handlers.handleRentalMessage).not.toHaveBeenCalled();
    expect(handlers.onAgentSend).not.toHaveBeenCalled();
  });
  it("does not start a new rental search when no selected apartment resolves", async () => {
    const handlers = makeHandlers();
    const text = "Show cafés within 800 meters of this apartment";
    expect(await sendConciergeUserMessage(text, handlers)).toBe(true);
    expect(handlers.handleGroundedMessage).toHaveBeenCalledOnce();
    expect(handlers.handleRentalMessage).not.toHaveBeenCalled();
    expect(handlers.onAgentSend).toHaveBeenCalledWith(text, expect.any(String));
  });
});


describe("cross-domain chat switches clear stale apartment Details", () => {
  it.each([
    "Show me the details of the second restaurant",
    "Find restaurants in Laureles",
    "Find salsa events this weekend",
    "I need a venue for a birthday party for 30 people",
  ])("closes the old rental Details when switching vertical: %s", async (text) => {
    const handlers = makeHandlers();
    expect(await sendConciergeUserMessage(text, handlers)).toBe(true);
    expect(handlers.closeRentalDetails).toHaveBeenCalledTimes(1);
  });

  it.each([
    "Show me the details of the second apartment",
    "Search 2 bedroom rentals in Laureles",
    "Show cafés within 800 meters of this apartment",
    "Hi there",
  ])("keeps apartment Details open for same-topic and contextual requests: %s", async (text) => {
    const handlers = makeHandlers();
    expect(await sendConciergeUserMessage(text, handlers)).toBe(true);
    expect(handlers.closeRentalDetails).not.toHaveBeenCalled();
  });
});
