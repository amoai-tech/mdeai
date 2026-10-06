"use client";

import { memo } from "react";

import { ConciergeLocalChatMessages } from "@/components/chat/concierge-local-chat-messages";
import { useEventFastPath } from "@/components/chat/event-fast-path-context";
import { EventFastPathPanel } from "@/components/chat/event-fast-path-panel";
import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { EventResultsPanel } from "@/components/chat/event-results-panel";
import { useEventSearchResults } from "@/components/chat/event-search-results-context";
import { useGroundedFastPath } from "@/components/chat/grounded-fast-path-context";
import { GroundedFastPathPanel } from "@/components/chat/grounded-fast-path-panel";
import { useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { RentalFastPathPanel } from "@/components/chat/rental-fast-path-panel";
import { useRestaurantFastPath } from "@/components/chat/restaurant-fast-path-context";
import { RestaurantFastPathPanel } from "@/components/chat/restaurant-fast-path-panel";

/** True when there is any local message, fast-path result or citation for the tail to render. */
export function useTranscriptTailHasContent(): boolean {
  const { messages } = useEventLocalChat();
  const rental = useRentalFastPath();
  const event = useEventFastPath();
  const grounded = useGroundedFastPath();
  const restaurant = useRestaurantFastPath();
  const { webCitations } = useEventSearchResults();
  return (
    messages.length > 0 ||
    rental.toolResult != null ||
    event.toolResult != null ||
    grounded.toolResult != null ||
    restaurant.toolResult != null ||
    webCitations.length > 0
  );
}

/**
 * SAN-966 — what renders after the transcript's messages and before the composer: local shortcut
 * messages, the fast-path result panels (rental, event, grounded, restaurant) and event web
 * citations. `ConciergeMessageView` mounts it inside the CopilotKit transcript (the deterministic
 * test chat mounts it directly above its input), so the composer always follows it.
 *
 * It renders after the WHOLE transcript, so a result panel from an earlier search stays below a
 * newer unrelated answer until New Chat. It is not mounted while CopilotChatView shows its
 * empty-thread welcome screen; `conciergeWelcomeScreen` turns that screen off when this has
 * content. It owns no state: it reuses the existing contexts and panels.
 */
export const ConciergeTranscriptTail = memo(function ConciergeTranscriptTail({
  transcriptMessageIds,
}: {
  /** Ids the CopilotKit transcript already shows (same name as `excludeIds` below). */
  transcriptMessageIds?: ReadonlySet<string>;
}) {
  return (
    <div data-testid="concierge-transcript-tail" className="flex min-w-0 flex-col">
      <ConciergeLocalChatMessages excludeIds={transcriptMessageIds} />
      <RentalFastPathPanel />
      <EventFastPathPanel />
      <GroundedFastPathPanel />
      <RestaurantFastPathPanel />
      <EventResultsPanel />
    </div>
  );
});
