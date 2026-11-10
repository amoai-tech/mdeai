"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { useOptionalRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { clearConciergePendingSend, setConciergePendingSend } from "@/lib/concierge-pending-store";
import { getConciergeErrorForThread, reportConciergeError } from "@/lib/concierge-error-store";
import { useOptionalThreadNav } from "@/lib/chat/thread-nav-context";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";
import type { ConciergeSendHandlers } from "@/lib/concierge-send-user-message";

/**
 * Ask the mounted event results to open Quick view for one event, and report whether it
 * actually opened. Bounded so a chat turn can never wait on a missing listener: after
 * the timeout the caller falls through to the model instead of confirming a no-op.
 */
const EVENT_CARD_RECOVERY_EVENT = "mde:event-card-recovery";
const EVENT_CARD_RECOVERY_RESULT = "mde:event-card-recovery-result";
const EVENT_CARD_RECOVERY_TIMEOUT_MS = 1_800;

/** True when any A2UI event card is already on screen (the model answered with a card). */
export function hasRenderedEventCard(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector('[data-testid="a2ui-event-card"]'));
}

/**
 * Request an existing event Quick view and resolve only after that exact event
 * confirms opening. Time out safely if no listener responds.
 */
export function requestEventCardRecovery(
  eventId: string,
  timeoutMs = EVENT_CARD_RECOVERY_TIMEOUT_MS,
  options: { anyCardBefore?: number } = {},
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const requestId = `${eventId}:${crypto.randomUUID()}`;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (opened: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener(EVENT_CARD_RECOVERY_RESULT, onResult as EventListener);
      window.clearTimeout(timer);
      resolve(opened);
    };
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId?: unknown; opened?: unknown }>).detail;
      if (detail?.requestId !== requestId) return;
      finish(detail.opened === true);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    window.addEventListener(EVENT_CARD_RECOVERY_RESULT, onResult as EventListener);
    window.dispatchEvent(
      new CustomEvent(EVENT_CARD_RECOVERY_EVENT, {
        detail: { eventId, requestId, anyCardBefore: options.anyCardBefore },
      }),
    );
  });
}

import { useEventSearchFastPath } from "@/hooks/use-event-search-fast-path";
import { isEventCardRenderRequest, resolveExplicitEventRequest } from "@/lib/event-search-fast-path";
import { useOptionalEventSearchResults } from "@/components/chat/event-search-results-context";
import { useEventVenueBookingFastPath } from "@/hooks/use-event-venue-booking-fast-path";
import { useGroundedSearchFastPath } from "@/hooks/use-grounded-search-fast-path";
import { useRentalSearchFastPath } from "@/hooks/use-rental-search-fast-path";
import { useRestaurantSearchFastPath } from "@/hooks/use-restaurant-search-fast-path";
import { useSession } from "@/hooks/use-session";
import { isSelectedRentalCafeNearbyRequest } from "@/lib/cafe-search-fast-path";
import { closestGroundedResult, parseGroundedRankQuestion } from "@/lib/closest-grounded-result";
import {
  GROUNDED_AMENITY_UNKNOWN_MESSAGE,
  hasExplicitAmenity,
  isGroundedAmenityQuestion,
} from "@/lib/grounded-amenity-guard";
import { normalizeToolEnvelope } from "@/lib/normalize-tool-envelope";
import { useOptionalMapContext } from "@/platform/maps/map-context";
import { useGroundedFastPath } from "@/components/chat/grounded-fast-path-context";
import { useOptionalRichCardResults } from "@/components/chat/rich-card-results-context";
import { createClient } from "@/lib/supabase/client";
import { stashConciergeDraft } from "@/lib/concierge-draft-store";

/** Shown in the transcript when the AI runtime cannot take a free-form question. */
export const AGENT_UNAVAILABLE_MESSAGE =
  "The assistant can't answer right now. Please try again in a moment — searches for rentals, events, restaurants and cafés still work.";

/** Fast-path + agent handlers for sendConciergeUserMessage (CopilotChat + ?q=). */
export function useConciergeSendHandlers(): ConciergeSendHandlers {
  const { appendMessage, waitForRuntimeReady, retryLastTurn } = useConciergeChat();
  const nav = useOptionalThreadNav();
  const threadId = nav?.activeThreadId ?? nav?.sessionThreadId;
  const { showExchange, showNotice, showSignInPrompt } = useEventLocalChat();
  const { state } = useConciergeCoAgent();
  // The public guest search has real thread-local criteria even when there is
  // no authenticated CoAgent memory; the shared router must see that context.
  const visibleRentalSearch = useOptionalRentalFastPath()?.searchMeta;
  const map = useOptionalMapContext();
  const { toolResult } = useGroundedFastPath();
  const groundedShownIds = useOptionalRichCardResults()?.groundedShownIds;
  const { user, loading: sessionLoading } = useSession();
  const signedIn = Boolean(user && !user.is_anonymous);
  // The rental hook can need the agent for a message it queued while a search was running and then
  // could not answer; `onAgentSend` is defined below, so it is reached through a ref.
  const agentSendRef = useRef<((text: string) => Promise<boolean>) | null>(null);
  const { handleUserMessage: handleRentalMessage } = useRentalSearchFastPath({
    onUnhandled: async (text) => {
      setConciergePendingSend(true);
      return (await agentSendRef.current?.(text)) ?? false;
    },
  });
  const { handleUserMessage: handleEventMessage, activeEventId, activeEventRows } = useEventSearchFastPath();
  const eventResultsContext = useOptionalEventSearchResults();
  const { handleUserMessage: handleRestaurantMessage } =
    useRestaurantSearchFastPath();
  const { handleUserMessage: handleGroundedFastPathMessage } =
    useGroundedSearchFastPath();
  // The composer already knows this session. Decline contextual Nearby for
  // guests before the billable route, allowing the existing Concierge agent
  // fallback to show its sign-in prompt instead of retrying a guaranteed 401.
  const handleGroundedAmenityFollowUp = useCallback(
    (text: string, submissionId?: string): Promise<boolean> => {
      if (!isGroundedAmenityQuestion(text)) return Promise.resolve(false);
      const remembered = (state as {
        lastGroundedResults?: Array<Record<string, unknown> & { id: string }>;
      } | undefined)?.lastGroundedResults;
      const displayed = (normalizeToolEnvelope(toolResult).results ?? []) as Array<{ id?: unknown }>;
      // Both fast-path and Mastra tool-rendered cards can own current rows.
      const displayedIds = new Set<unknown>([...(groundedShownIds ?? []), ...displayed.map((row) => row.id)]);
      // A subsequent search can replace cards without clearing co-agent memory.
      if (!remembered?.length || !displayedIds.size ||
          !remembered.every((row) => displayedIds.has(row.id))) {
        return Promise.resolve(false);
      }
      if (hasExplicitAmenity(remembered, text)) return Promise.resolve(false);
      showExchange(text, GROUNDED_AMENITY_UNKNOWN_MESSAGE, submissionId);
      return Promise.resolve(true);
    },
    [state, toolResult, groundedShownIds, showExchange],
  );

  const handleGroundedMessage = useCallback(
    (text: string, submissionId?: string): Promise<boolean> => {
      if (isGroundedAmenityQuestion(text)) {
        return handleGroundedAmenityFollowUp(text, submissionId).then((handled) =>
          handled || handleGroundedFastPathMessage(text, submissionId));
      }
      // Closest/nearest answers come from measured data, not another model turn.
      // This prevents invented distances and raw Place IDs in the reply.
      const groundedMemory = state as
        | { lastGroundedResults?: Parameters<typeof closestGroundedResult>[0]; selectedListingId?: string }
        | undefined;
      const rank = parseGroundedRankQuestion(text);
      const rows = groundedMemory?.lastGroundedResults;
      // Only rank the result set currently on screen. A restaurant search clears
      // this context; ranking old rows after that would answer the wrong panel.
      const displayed = (normalizeToolEnvelope(toolResult).results ?? []) as Array<{ id?: unknown }>;
      const displayedIds = new Set(displayed.map((row) => row.id));
      const rowsBelongToDisplay =
        Boolean(rows?.length) && rows!.every((row) => displayedIds.has(row.id));
      // Map context is the freshest selection. If a rental pin is selected, use
      // it; without one, keep the working-memory selection.
      const selectedRentalPin = map?.pins.some(
        (pin) => pin.id === map.selectedPinId && pin.category === "rental",
      );
      const reconciledListingId =
        selectedRentalPin && map?.selectedPinId
          ? map.selectedPinId.replace(/^rental-/, "")
          : groundedMemory?.selectedListingId;
      const ranked = rank && rowsBelongToDisplay
        ? closestGroundedResult(rows, reconciledListingId, rank)
        : null;
      // No matching anchor or measured row: fall through so a new Nearby search
      // (or the agent) can run instead of answering from stale rows.
      if (rank && ranked) {
        const label = rank === "farthest" ? "farthest" : "closest";
        const message = ranked.partial
          ? `Among the places with a measured distance, ${ranked.title} is ${label} — about ${ranked.distanceMeters} m away (straight-line).`
          : `${ranked.title} is the ${label}, about ${ranked.distanceMeters} m away (straight-line).`;
        showExchange(text, message, submissionId);
        return Promise.resolve(true);
      }
      if (isSelectedRentalCafeNearbyRequest(text) && !signedIn) {
        return Promise.resolve(false);
      }
      return handleGroundedFastPathMessage(text, submissionId);
    },
    [
      handleGroundedFastPathMessage,
      handleGroundedAmenityFollowUp,
      signedIn,
      state,
      showExchange,
      map,
      toolResult,
    ],
  );
  const { handleUserMessage: handleEventVenueBookingMessage } =
    useEventVenueBookingFastPath();

  // A typed question must never vanish. If the runtime is not connected (down, refusing, or still
  // connecting) or there is no agent, nothing reaches the transcript and a run would hang or fail, so
  // show the question with a notice. If the run started and then failed
  // (CopilotKit reports that through onError and still resolves, or it rejects), the question is
  // already in the transcript, so only the notice is added. sendConciergeUserMessage clears the
  // error signal at the start of every send, so a non-zero version here belongs to this run.
  /** Validate session, wait for the existing agent, and show an honest result. */
  const performAgentSend = useCallback(
    async (text: string, submissionId?: string) => {
      // A fast guest can send before the session check has finished. Ask once, now, instead of
      // letting that send reach the protected runtime (401 -> "try again"). If the check itself throws
      // (network down) we keep what we already know: no user yet means the sign-in offer, which heals
      // itself for a signed-in visitor (/login sends them straight back to /chat).
      let hasAccount = signedIn;
      if (sessionLoading) {
        try {
          const { data } = await createClient().auth.getUser();
          hasAccount = Boolean(data.user && !data.user.is_anonymous);
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
      const anyCardsBefore = typeof document === "undefined"
        ? 0
        : document.querySelectorAll('[data-testid="a2ui-event-card"]').length;
      const currentEventRows = eventResultsContext?.rows?.length ? eventResultsContext.rows : (activeEventRows ?? []);
      const directEventId = isEventCardRenderRequest(text)
        ? resolveExplicitEventRequest(text, currentEventRows)
        : null;
      if (directEventId) {
        // Open the card FIRST and confirm only if it actually opened. The old order
        // showed "Here is the event card." unconditionally, so a request the listener
        // could not satisfy (already handled, no matching row, card already rendered)
        // confirmed an action that never happened.
        const opened = await requestEventCardRecovery(directEventId);
        if (opened) {
          showExchange(text, "Here is the event card.", submissionId);
          clearConciergePendingSend();
          return true;
        }
        // Falling through sends the request to the model, so the user gets a real answer
        // instead of a false confirmation.
      }
      try {
        if ((await waitForRuntimeReady()) && (await appendMessage(text))) {
          // If the model returns no A2UI surface, the existing real result can still be
          // shown through Quick view. Two rules keep it honest:
          //  - never open a card when the model already rendered one (any event), and
          //  - target the event the user actually asked for, not the first row. Falling
          //    back to `activeEventId` after a request for the second event opened the
          //    FIRST event on top of the model's own card.
          if (isEventCardRenderRequest(text) && !hasRenderedEventCard()) {
            const fallbackEventId = directEventId ?? activeEventId;
            if (fallbackEventId) void requestEventCardRecovery(fallbackEventId, undefined, { anyCardBefore: anyCardsBefore });
          }
          // Another conversation can report a late error during this run.
          // Only this conversation's stream failure should trigger its notice.
          if (getConciergeErrorForThread(threadId).version === 0) return true;
          showNotice(AGENT_UNAVAILABLE_MESSAGE);
        } else {
          showExchange(text, AGENT_UNAVAILABLE_MESSAGE, submissionId);
        }
      } catch (error) {
        console.error("[concierge-agent-send]", error);
        reportConciergeError({ threadId, retry: retryLastTurn });
        showNotice(AGENT_UNAVAILABLE_MESSAGE);
      }
      clearConciergePendingSend();
      return true;
    },
    [appendMessage, waitForRuntimeReady, retryLastTurn, threadId, showExchange, showNotice, showSignInPrompt, signedIn, sessionLoading, activeEventId, activeEventRows, eventResultsContext],
  );

  // A cold-runtime wait must not turn two clicks into two agent runs.
  const pendingAgentSendsRef = useRef(new Map<string, Promise<boolean>>());
  const lastAgentSendRef = useRef<Promise<void>>(Promise.resolve());
  /**
   * Coalesce identical in-flight questions and serialize distinct questions.
   * Release each key after completion so later deliberate repeats still work.
   */
  const onAgentSend = useCallback((text: string, submissionId?: string): Promise<boolean> => {
    const existing = pendingAgentSendsRef.current.get(text);
    if (existing) return existing;
    const pending = lastAgentSendRef.current.then(() => performAgentSend(text, submissionId));
    pendingAgentSendsRef.current.set(text, pending);
    lastAgentSendRef.current = pending.then(() => undefined, () => undefined);
    void pending.finally(() => {
      if (pendingAgentSendsRef.current.get(text) === pending) {
        pendingAgentSendsRef.current.delete(text);
      }
    }).catch(() => undefined);
    return pending;
  }, [performAgentSend]);

  useEffect(() => {
    agentSendRef.current = onAgentSend;
  }, [onAgentSend]);

  // A rental search is under way when its query is saved and the last intent is still a rental one.
  // Saved older conversations carry "rental_refine", which the current intent list no longer has.
  const lastIntentName: string | undefined = state?.lastIntent;
  // The latest intent wins: old rental cards may still be visible after an
  // authenticated AI turn about coworking, events or another subject. Guests
  // have no CoAgent intent, so current rental searchMeta remains their context.
  const rentalIntentIsCurrent = lastIntentName === undefined ||
    lastIntentName === "rental_search" || lastIntentName === "rental_refine";
  const inRentalSearch = rentalIntentIsCurrent &&
    (Boolean(visibleRentalSearch) || Boolean(state?.lastRentalQuery));

  return useMemo(
    () => ({
      handleRentalMessage,
      handleEventVenueBookingMessage,
      handleEventMessage,
      handleGroundedMessage,
      handleGroundedAmenityFollowUp,
      handleRestaurantMessage,
      onAgentSend,
      lastIntent: state?.lastIntent,
      inRentalSearch,
      threadId,
      retryLastTurn,
    }),
    [
      handleRentalMessage,
      handleEventVenueBookingMessage,
      handleEventMessage,
      handleGroundedMessage,
      handleGroundedAmenityFollowUp,
      handleRestaurantMessage,
      onAgentSend,
      state?.lastIntent,
      inRentalSearch,
      retryLastTurn,
      threadId,
    ],
  );
}
