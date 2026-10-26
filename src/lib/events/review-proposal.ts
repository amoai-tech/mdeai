import type { EventDraftState } from "@/lib/types";
import {
  createReviewProposal,
  type ReviewProposal,
  type ReviewReceipt,
} from "@/platform/contracts/review-proposal";

export const EVENT_PUBLISH_TARGET = "event.publish";

/** One stable proposal per review attempt; the caller may supply the id to keep retries identical. */
export async function buildEventReviewProposal(
  draft: EventDraftState,
  proposalId: string,
): Promise<ReviewProposal> {
  return createReviewProposal({
    proposalId,
    target: { kind: "event", id: draft.publishedEventId ?? EVENT_PUBLISH_TARGET },
    baseVersion: draft.approvalRequestId ?? "draft",
    draft,
  });
}

export function eventPublishReceipt(
  proposalId: string,
  result: { eventId: string; slug: string },
): ReviewReceipt {
  return {
    proposalId,
    status: "saved",
    savedId: result.eventId,
    readbackUrl: `/events/${encodeURIComponent(result.slug)}`,
    message: "Event published and saved.",
    savedAt: new Date().toISOString(),
  };
}
