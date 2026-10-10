"use client";

import { useCallback, useMemo } from "react";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { clearConciergePendingSend } from "@/lib/concierge-pending-store";
import { getConciergeErrorVersion, reportConciergeError } from "@/lib/concierge-error-store";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";
import type { ConciergeSendHandlers } from "@/lib/concierge-send-user-message";
import { useEventSearchFastPath } from "@/hooks/use-event-search-fast-path";
import { useEventVenueBookingFastPath } from "@/hooks/use-event-venue-booking-fast-path";
import { useGroundedSearchFastPath } from "@/hooks/use-grounded-search-fast-path";
import { useRentalSearchFastPath } from "@/hooks/use-rental-search-fast-path";
import { useNewProjectSearchFastPath } from "@/hooks/use-new-project-search-fast-path";
import { useRestaurantSearchFastPath } from "@/hooks/use-restaurant-search-fast-path";

/** Shown in the transcript when the AI runtime cannot take a free-form question. */
export const AGENT_UNAVAILABLE_MESSAGE =
  "The assistant can't answer right now. Please try again in a moment — searches for rentals, events, restaurants and cafés still work.";

/** Fast-path + agent handlers for sendConciergeUserMessage (CopilotChat + ?q=). */
export function useConciergeSendHandlers(): ConciergeSendHandlers {
  const { appendMessage, isRuntimeUnavailable } = useConciergeChat();
  const { showExchange, showNotice } = useEventLocalChat();
  const { state } = useConciergeCoAgent();
  const { handleUserMessage: handleRentalMessage } = useRentalSearchFastPath();
  const { handleUserMessage: handleNewProjectMessage } = useNewProjectSearchFastPath();
  const { handleUserMessage: handleEventMessage } = useEventSearchFastPath();
  const { handleUserMessage: handleRestaurantMessage } =
    useRestaurantSearchFastPath();
  const { handleUserMessage: handleGroundedMessage } =
    useGroundedSearchFastPath();
  const { handleUserMessage: handleEventVenueBookingMessage } =
    useEventVenueBookingFastPath();

  // A typed question must never vanish. If the runtime is not connected (down, refusing, or still
  // connecting) or there is no agent, nothing reaches the transcript and a run would hang or fail, so
  // show the question with a notice. If the run started and then failed
  // (CopilotKit reports that through onError and still resolves, or it rejects), the question is
  // already in the transcript, so only the notice is added. sendConciergeUserMessage clears the
  // error signal at the start of every send, so a non-zero version here belongs to this run.
  const onAgentSend = useCallback(
    async (text: string) => {
      try {
        if (!isRuntimeUnavailable() && (await appendMessage(text))) {
          if (getConciergeErrorVersion() === 0) return true;
          showNotice(AGENT_UNAVAILABLE_MESSAGE);
        } else {
          showExchange(text, AGENT_UNAVAILABLE_MESSAGE);
        }
      } catch (error) {
        console.error("[concierge-agent-send]", error);
        reportConciergeError();
        showNotice(AGENT_UNAVAILABLE_MESSAGE);
      }
      clearConciergePendingSend();
      return true;
    },
    [appendMessage, isRuntimeUnavailable, showExchange, showNotice],
  );

  return useMemo(
    () => ({
      handleRentalMessage,
      handleNewProjectMessage,
      handleEventVenueBookingMessage,
      handleEventMessage,
      handleGroundedMessage,
      handleRestaurantMessage,
      onAgentSend,
      lastIntent: state?.lastIntent,
    }),
    [
      handleRentalMessage,
      handleNewProjectMessage,
      handleEventVenueBookingMessage,
      handleEventMessage,
      handleGroundedMessage,
      handleRestaurantMessage,
      onAgentSend,
      state?.lastIntent,
    ],
  );
}
