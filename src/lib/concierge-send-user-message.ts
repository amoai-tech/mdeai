import { clearConciergeError, reportConciergeError } from "@/lib/concierge-error-store";
import { isSelectedRentalCafeNearbyRequest } from "@/lib/cafe-search-fast-path";
import { looksLikeRentalAnalysis, looksLikeRentalSearch } from "@/lib/rental-query-parser";
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
  /** Clear old apartment Details on a confirmed cross-category topic switch. */
  closeRentalDetails?: () => void;
  /** Publish a confirmed new topic and clear prior vertical display state. */
  onTopicShift?: (intent: FlashRouteClassification["intent"], stage: "accepted" | "completed" | "failed") => void;
  /** Open a shown rental by its current position; never launch another search for Details. */
  handleRentalDetailsMessage?: (text: string, submissionId?: string) => Promise<boolean>;
  handleRentalMessage: (text: string, submissionId?: string) => Promise<boolean>;
  /** Wired when SAN-494 · EVT-035 — Restaurant card Event Venue CTA venue fast-path lands; optional until then. */
  handleEventVenueBookingMessage?: (text: string, submissionId?: string) => Promise<boolean>;
  handleEventMessage: (text: string, submissionId?: string) => Promise<boolean>;
  handleGroundedMessage: (text: string, submissionId?: string) => Promise<boolean>;
  /** Optional current-results-only guard, checked before an agent route. */
  handleGroundedAmenityFollowUp?: (text: string, submissionId?: string) => Promise<boolean>;
  handleRestaurantMessage: (text: string, submissionId?: string) => Promise<boolean>;
  onAgentSend: (text: string, submissionId?: string, onAccepted?: () => void, onCompleted?: () => void, onFailed?: () => void) => Promise<boolean>;
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
  submissionId: string,
): Promise<boolean> {
  switch (target) {
    case "rental":
      return handlers.handleRentalMessage(text, submissionId);
    case "event_venue_booking":
      return (await handlers.handleEventVenueBookingMessage?.(text, submissionId)) ?? false;
    case "event":
      return handlers.handleEventMessage(text, submissionId);
    case "grounded":
      return handlers.handleGroundedMessage(text, submissionId);
    case "restaurant":
      return handlers.handleRestaurantMessage(text, submissionId);
    default:
      return false;
  }
}

/** Shared send pipeline — classify intent first, then fast-path handlers, then agent. */
export async function sendConciergeUserMessage(
  text: string,
  handlers: ConciergeSendHandlers,
  submissionId = crypto.randomUUID(),
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const threadId = handlers.threadId;
  clearConciergeError(threadId);
  let agentAttempted = false;

  try {
    // Contextual cafés beside the selected rental are NOT a new rental search.
    // If no genuine selected rental exists the handler declines safely.
    if (isSelectedRentalCafeNearbyRequest(trimmed)) {
      if (await handlers.handleGroundedMessage(trimmed, submissionId)) return true;
      // No selected, server-resolvable rental: do not misroute this café follow-up
      // to apartment search. Signed-in Concierge can ask which listing; guests
      // receive the existing sign-in prompt rather than fabricated Nearby pins.
      setConciergePendingSend(true);
      agentAttempted = true;
      return await handlers.onAgentSend(trimmed, submissionId);
    }

    // An existing-results question may be classified as general concierge.
    // Check the current café facts before any model dispatch or other fast path.
    if (await handlers.handleGroundedAmenityFollowUp?.(trimmed, submissionId)) {
      return true;
    }

    // A shown-apartment Details request is a UI action, not another search/model run.
    if (await handlers.handleRentalDetailsMessage?.(trimmed, submissionId)) return true;

    // A rental comparison declined by the rental fast path must not fall through
    // to the café/event handlers merely because the question mentions an amenity.
    // Leave ordinary rental discovery (including neighborhood comparisons) public.
    if (looksLikeRentalSearch(trimmed) && looksLikeRentalAnalysis(trimmed)) {
      setConciergePendingSend(true);
      agentAttempted = true;
      return await handlers.onAgentSend(trimmed, submissionId);
    }

    const classification = await resolveRouterClassification(trimmed, {
      lastIntent: handlers.lastIntent,
      inRentalSearch: handlers.inRentalSearch,
    });

    // Only the deterministic explicit coworking route changes the active
    // rental context here. Flash topicShift hints and restaurant/event fast
    // paths already have their own result/pin policy (including empty results).
    // The agent calls onAccepted only after an authenticated message was
    // actually appended, so guests and failed runtime starts keep rental cards.
    const coworkingShift = classification.explicitTopicShift === "coworking" &&
      classification.intent === "general_concierge" && handlers.inRentalSearch;
    if (coworkingShift) {
      setConciergePendingSend(true);
      agentAttempted = true;
      return await handlers.onAgentSend(
        trimmed, submissionId,
        () => handlers.onTopicShift?.(classification.intent, "accepted"),
        () => {
          handlers.closeRentalDetails?.();
          handlers.onTopicShift?.(classification.intent, "completed");
        },
        () => handlers.onTopicShift?.(classification.intent, "failed"),
      );
    }
    if (classification.intent === "restaurant_discovery" ||
        classification.intent === "event_discovery" ||
        classification.intent === "venue_booking") {
      handlers.closeRentalDetails?.();
    }

    for (const target of routerHandlerOrderFromClassification(classification)) {
      if (await invokeConciergeHandler(target, trimmed, handlers, submissionId)) return true;
    }

    setConciergePendingSend(true);
    agentAttempted = true;
    // Await so an agent rejection is caught here and gets the correct
    // thread/retry identity instead of escaping as an unhandled rejection.
    return await handlers.onAgentSend(trimmed, submissionId);
  } catch (err) {
    console.error("[concierge-send]", err);
    clearConciergePendingSend();
    // A fast-path failure must retry that search, not the previous agent turn.
    // An agent failure already has its user message in the transcript, so it
    // retries the existing turn instead of appending a duplicate.
    let retryInFlight = false;
    const retry = async () => {
      if (retryInFlight) return false;
      retryInFlight = true;
      try {
        return agentAttempted && handlers.retryLastTurn
          ? await handlers.retryLastTurn()
          : await sendConciergeUserMessage(trimmed, handlers, submissionId);
      } finally {
        retryInFlight = false;
      }
    };
    reportConciergeError({ threadId, retry });
    return false;
  }
}
