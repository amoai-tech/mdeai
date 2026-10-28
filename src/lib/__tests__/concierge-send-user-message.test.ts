import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearConciergeError, getConciergeErrorSnapshot } from "@/lib/concierge-error-store";
import { sendConciergeUserMessage } from "../concierge-send-user-message";

function makeHandlers() {
  return {
    threadId: undefined as string | undefined,
    retryLastTurn: undefined as (() => Promise<boolean>) | undefined,
    handleRentalMessage: vi.fn(async () => false),
    handleEventVenueBookingMessage: vi.fn(async () => false),
    handleEventMessage: vi.fn(async () => false),
    handleGroundedMessage: vi.fn(async () => false),
    handleRestaurantMessage: vi.fn(async () => false),
    onAgentSend: vi.fn(async () => true),
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
    expect(handlers.onAgentSend).toHaveBeenCalledWith("plan my weekend");
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
    expect(handlers.onAgentSend).toHaveBeenCalledWith("music events tonight");

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

  describe("SAN-407 · INT-004 — a whole-city follow-up reaches the rental search", () => {
    it.each(["Anywhere is fine", "Anywhere in Medellín is fine", "any neighborhood works"])(
      "%j after a rental search is tried on the rental fast path before the assistant",
      async (text) => {
        const handlers = { ...makeHandlers(), lastIntent: "rental_search" as const };
        handlers.handleRentalMessage.mockResolvedValueOnce(true);

        await sendConciergeUserMessage(text, handlers);

        expect(handlers.handleRentalMessage).toHaveBeenCalledWith(text);
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
