"use client";

import { useState } from "react";
import { EventPublishApprovalPanel } from "@/components/host/event-publish-approval-panel";
import { Button } from "@/components/ui/button";
import { selectPublishDraft } from "@/lib/events/host-event-wizard-tool-handlers";
import { isDraftReadyForPublish, type EventDraftState } from "@/lib/types";

/**
 * Uses the SAME authenticated atomic publisher as the AI HITL card.
 * The host can review and publish even if the model provider is unavailable.
 */
export function HostEventManualPublish({
  draft,
  onPublished,
}: {
  draft: EventDraftState;
  onPublished: (result: {
    eventId: string;
    slug: string;
    approvalRequestId?: string;
  }) => void;
}) {
  const [reviewDraft, setReviewDraft] = useState<EventDraftState | null>(null);
  const ready = isDraftReadyForPublish(draft);

  return (
    <section aria-label="Publish your event" className="mx-2 my-3 space-y-2 sm:mx-4">
      <Button
        type="button"
        data-testid="host-event-review-manual"
        disabled={!ready || reviewDraft !== null || draft.status === "published"}
        onClick={() => setReviewDraft(selectPublishDraft(undefined, draft))}
      >
        Review and publish
      </Button>
      {!ready && draft.status !== "published" ? (
        <p className="text-xs text-muted-foreground">
          Add a title, neighborhood, valid start time, venue, capacity, and ticket price or tier to publish.
        </p>
      ) : null}
      {reviewDraft ? (
        <EventPublishApprovalPanel
          draft={reviewDraft}
          status="executing"
          onPublished={onPublished}
          respond={(decision) => {
            if (decision !== "approved") setReviewDraft(null);
          }}
        />
      ) : null}
    </section>
  );
}
