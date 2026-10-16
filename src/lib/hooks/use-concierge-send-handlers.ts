"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { clearConciergePendingSend, setConciergePendingSend } from "@/lib/concierge-pending-store";
import { getConciergeErrorVersion, reportConciergeError } from "@/lib/concierge-error-store";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";
import type { ConciergeSendHandlers } from "@/lib/concierge-send-user-message";
import { useEventSearchFastPath } from "@/hooks/use-event-search-fast-path";
import { useEventVenueBookingFastPath } from "@/hooks/use-event-venue-booking-fast-path";
import { useGroundedSearchFastPath } from "@/hooks/use-grounded-search-fast-path";
import { useRentalSearchFastPath } from "@/hooks/use-rental-search-fast-path";
import { useRestaurantSearchFastPath } from "@/hooks/use-restaurant-search-fast-path";
import { useSession } from "@/hooks/use-session";
import { createClient } from "@/lib/supabase/client";
import { stashConciergeDraft } from "@/lib/concierge-draft-store";

/** Shown in the transcript when the AI runtime cannot take a free-form question. */
export const AGENT_UNAVAILABLE_MESSAGE =
  "The assistant can't answer right now. Please try again in a moment — searches for rentals, events, restaurants and cafés still work.";

/** Fast-path + agent handlers for sendConciergeUserMessage (CopilotChat + ?q=). */
export function useConciergeSendHandlers(): ConciergeSendHandlers {
  const { appendMessage, isRuntimeUnavailable } = useConciergeChat();
  const { showExchange, showNotice, showSignInPrompt } = useEventLocalChat();
  const { state } = useConciergeCoAgent();
  const { user, loading: sessionLoading } = useSession();
  const signedIn = Boolean(user);
  // The rental hook can need the agent for a message it queued while a search was running and then
  // could not answer; `onAgentSend` is defined below, so it is reached through a ref.
  const agentSendRef = useRef<((text: string) => Promise<boolean>) | null>(null);
  const { handleUserMessage: handleRentalMessage } = useRentalSearchFastPath({
    onUnhandled: async (text) => {
      setConciergePendingSend(true);
      return (await agentSendRef.current?.(text)) ?? false;
    },
  });
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
      // A fast guest can send before the session check has finished. Ask once, now, instead of
      // letting that send reach the protected runtime (401 -> "try again"). If the check itself throws
      // (network down) we keep what we already know: no user yet means the sign-in offer, which heals
      // itself for a signed-in visitor (/login sends them straight back to /chat).
      let hasAccount = signedIn;
      if (sessionLoading) {
        try {
          const { data } = await createClient().auth.getUser();
          hasAccount = Boolean(data.user);
        } catch {
          // keep `signedIn`
        }
      }
      if (!hasAccount) {
        // No agent run: the runtime would answer 401, and no thread may be created for a guest.
        stashConciergeDraft(text);
        showSignInPrompt(text);
        clearConciergePendingSend();
        return true;
      }
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
    [appendMessage, isRuntimeUnavailable, showExchange, showNotice, showSignInPrompt, signedIn, sessionLoading],
  );

  useEffect(() => {
    agentSendRef.current = onAgentSend;
  }, [onAgentSend]);

  // A rental search is under way when its query is saved and the last intent is still a rental one.
  // Saved older conversations carry "rental_refine", which the current intent list no longer has.
  const lastIntentName: string | undefined = state?.lastIntent;
  const inRentalSearch =
    Boolean(state?.lastRentalQuery) &&
    (lastIntentName === undefined || lastIntentName === "rental_search" || lastIntentName === "rental_refine");

  return useMemo(
    () => ({
      handleRentalMessage,
      handleEventVenueBookingMessage,
      handleEventMessage,
      handleGroundedMessage,
      handleRestaurantMessage,
      onAgentSend,
      lastIntent: state?.lastIntent,
      inRentalSearch,
    }),
    [
      handleRentalMessage,
      handleEventVenueBookingMessage,
      handleEventMessage,
      handleGroundedMessage,
      handleRestaurantMessage,
      onAgentSend,
      state?.lastIntent,
      inRentalSearch,
    ],
  );
}
