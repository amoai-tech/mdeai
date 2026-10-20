import { clearConciergeError, reportConciergeError } from "@/lib/concierge-error-store";
import {
  routerHandlerOrderFromClassification,
  type RouterRoutingTarget,
} from "@/lib/router-intent";
import {
  resolveRouterClassification,
  type FlashRouteClassification,
} from "@/lib/flash-route-classifier";
import {
  clearConciergePendingSend,
  setConciergePendingSend,
} from "@/lib/concierge-pending-store";

export type ConciergeSendHandlers = {
  /** Current conversation; used to keep a failure and its Retry in the right chat. */
  threadId?: string;
  /** Retry the existing agent turn instead of sending the text again. */
  retryLastTurn?: () => Promise<boolean>;
  handleRentalMessage: (text: string) => Promise<boolean>;
  /** Wired when SAN-494 · EVT-035 — Restaurant card Event Venue CTA venue fast-path lands; optional until then. */
  handleEventVenueBookingMessage?: (text: string) => Promise<boolean>;
  handleEventMessage: (text: string) => Promise<boolean>;
  handleGroundedMessage: (text: string) => Promise<boolean>;
  handleRestaurantMessage: (text: string) => Promise<boolean>;
  onAgentSend: (text: string) => Promise<boolean>;
  /** Working-memory lastIntent — enables Flash topicShift (SAN-873). */
  lastIntent?: FlashRouteClassification["intent"];
  /** True while the conversation is in a rental search (current or saved legacy intent). */
  inRentalSearch?: boolean;
};

/** Dispatch a classified router target to its fast-path handler; false → try next or agent. */
/** Dispatch a classified router target to its fast-path handler. */
async function invokeConciergeHandler(
  target: RouterRoutingTarget,
  text: string,
  handlers: ConciergeSendHandlers,
): Promise<boolean> {
  switch (target) {
    case "rental":
      return handlers.handleRentalMessage(text);
    case "event_venue_booking":
      return (await handlers.handleEventVenueBookingMessage?.(text)) ?? false;
    case "event":
      return handlers.handleEventMessage(text);
    case "grounded":
      return handlers.handleGroundedMessage(text);
    case "restaurant":
      return handlers.handleRestaurantMessage(text);
    default:
      return false;
  }
}

/** Shared send pipeline — classify intent first, then fast-path handlers, then agent. */
export async function sendConciergeUserMessage(
  text: string,
  handlers: ConciergeSendHandlers,
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const threadId = handlers.threadId;
  clearConciergeError(threadId);
  let agentAttempted = false;

  try {
    const classification = await resolveRouterClassification(trimmed, {
      lastIntent: handlers.lastIntent,
      inRentalSearch: handlers.inRentalSearch,
    });

    for (const target of routerHandlerOrderFromClassification(classification)) {
      if (await invokeConciergeHandler(target, trimmed, handlers)) return true;
    }

    setConciergePendingSend(true);
    agentAttempted = true;
    // Await so an agent rejection is caught here and gets the correct
    // thread/retry identity instead of escaping as an unhandled rejection.
    return await handlers.onAgentSend(trimmed);
  } catch (err) {
    console.error("[concierge-send]", err);
    clearConciergePendingSend();
    // A fast-path failure must retry that search, not the previous agent turn.
    // An agent failure already has its user message in the transcript, so it
    // retries the existing turn instead of appending a duplicate.
    const retry =
      agentAttempted && handlers.retryLastTurn
        ? handlers.retryLastTurn
        : () => sendConciergeUserMessage(trimmed, handlers);
    reportConciergeError({ threadId, retry });
    return false;
  }
}
