"use client";

import { ConciergeLocalChatMessages } from "@/components/chat/concierge-local-chat-messages";
import { EventFastPathPanel } from "@/components/chat/event-fast-path-panel";
import { EventResultsPanel } from "@/components/chat/event-results-panel";
import { GroundedFastPathPanel } from "@/components/chat/grounded-fast-path-panel";
import { RentalFastPathPanel } from "@/components/chat/rental-fast-path-panel";
import { RestaurantFastPathPanel } from "@/components/chat/restaurant-fast-path-panel";

/**
 * SAN-966 — everything that belongs under the latest assistant answer, in one place.
 *
 * Fast-path results (rentals, events, grounded places, restaurants), their web citations and
 * any local shortcut messages used to be siblings of the chat, so the message box sat above
 * them. This is the single presentation owner: it renders inside the CopilotKit transcript
 * (see `ConciergeMessageView`), so the composer always follows the complete latest turn.
 *
 * It only reuses the existing result components and contexts; it adds no result model, store
 * or renderer.
 */
export function ConciergeTranscriptTail({
  transcriptMessageIds,
}: {
  /** Ids already shown by the CopilotKit transcript, so a local message is never shown twice. */
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
}
