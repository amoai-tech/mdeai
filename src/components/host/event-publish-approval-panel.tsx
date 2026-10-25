"use client";

import { useEffect, useState } from "react";
import { EventCard } from "@/components/copilot/event-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { draftToEventCardProps } from "@/lib/events/draft-to-event-card";
import {
  resolveApprovalCommit,
  type ApprovalCommitResponse,
} from "@/lib/events/resolve-approval-commit";
import {
  buildEventReviewProposal,
  eventPublishReceipt,
} from "@/lib/events/review-proposal";
import {
  computeDraftHash,
  type ReviewReceipt,
} from "@/platform/contracts/review-proposal";
import { EventDraftStateSchema, type EventDraftState } from "@/lib/types";
import type { ApprovalDecision } from "@/lib/events/approval-decision";

const PENDING_EVENT_PROPOSAL = "mde:pending-event-publish";
const COMPLETED_EVENT_PUBLISH = "mde:completed-event-publish";

type CompletedPublish = {
  draftHash: string;
  reviewId?: string;
  proposalId: string;
  eventId: string;
  slug: string;
  approvalRequestId?: string;
  savedAt: string;
};

function readCompletedPublish(
  draftHash: string,
  reviewId: string | undefined,
  identity: { approvalRequestId?: string; eventId?: string },
): CompletedPublish | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(COMPLETED_EVENT_PUBLISH) ?? "null") as
      | CompletedPublish
      | null;
    if (!stored || stored.draftHash !== draftHash || !stored.eventId || !stored.slug) {
      return null;
    }
    // Content alone is not review identity: a new review of the same event
    // details must not inherit an older receipt. The HITL tool-call id is the
    // stable identity for this review; approval/event ids are a fallback when
    // the parent draft already carries them.
    const sameReview = Boolean(reviewId) && stored.reviewId === reviewId;
    const sameApproval =
      Boolean(identity.approvalRequestId) &&
      stored.approvalRequestId === identity.approvalRequestId;
    const sameEvent = Boolean(identity.eventId) && stored.eventId === identity.eventId;
    return sameReview || sameApproval || sameEvent ? stored : null;
  } catch {
    return null;
  }
}

function storeCompletedPublish(value: CompletedPublish): void {
  try {
    sessionStorage.setItem(COMPLETED_EVENT_PUBLISH, JSON.stringify(value));
  } catch {
    // Storage is optional; the database receipt remains the authority.
  }
}

/** Keep the same idempotency key if a browser reload follows a lost response. */
function recoverProposalId(draftHash: string, candidateId: string): string {
  try {
    const previous = JSON.parse(sessionStorage.getItem(PENDING_EVENT_PROPOSAL) ?? "null") as
      | { draftHash?: string; proposalId?: string }
      | null;
    if (previous?.draftHash === draftHash && previous.proposalId &&
        /^[a-f0-9-]{36}$/i.test(previous.proposalId)) {
      return previous.proposalId;
    }
    sessionStorage.setItem(PENDING_EVENT_PROPOSAL, JSON.stringify({ draftHash, proposalId: candidateId }));
  } catch {
    // Storage is optional; database idempotency remains the authority.
  }
  return candidateId;
}

type EventPublishApprovalPanelProps = {
  draft: EventDraftState;
  /** Stable CopilotKit HITL tool-call id; new reviews get a new id. */
  reviewId?: string;
  status: "inProgress" | "executing" | "complete";
  respond: (decision: ApprovalDecision) => void;
  onPublished?: (payload: {
    eventId: string;
    slug: string;
    approvalRequestId?: string;
  }) => void;
};

/** F37 — HITL publish card for preview_and_publish. */
export function EventPublishApprovalPanel({
  draft,
  reviewId,
  status,
  respond,
  onPublished,
}: EventPublishApprovalPanelProps) {
  const [proposalId] = useState(() => draft.approvalRequestId ?? crypto.randomUUID());
  const [approvalRequestId, setApprovalRequestId] = useState(draft.approvalRequestId);
  const [decided, setDecided] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReviewReceipt | null>(null);
  const [lastDecision, setLastDecision] = useState<ApprovalDecision | null>(null);

  // A reload after a committed publish must show the original receipt instead of
  // opening a fresh review that could publish the same event again.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const hash = await computeDraftHash(EventDraftStateSchema.parse(draft));
        if (!active) return;
        const stored = readCompletedPublish(hash, reviewId, {
          approvalRequestId: draft.approvalRequestId,
          eventId: draft.publishedEventId,
        });
        if (!stored) return;
        setReceipt({
          proposalId: stored.proposalId,
          status: "saved",
          savedId: stored.eventId,
          readbackUrl: `/events/${encodeURIComponent(stored.slug)}`,
          message: "Event published and saved.",
          savedAt: stored.savedAt,
        });
        setApprovalRequestId(stored.approvalRequestId);
        setDecided(true);
      } catch {
        // A malformed draft is handled by the normal commit validation.
      }
    })();
    return () => {
      active = false;
    };
  }, [draft, reviewId]);

  const preview = draftToEventCardProps(draft, {
    slug: draft.publishedSlug ?? "preview",
  });

  async function commit(decision: ApprovalDecision) {
    if (decided || submitting) return;
    // Edit/Cancel only change the local draft. No database approval or
    // network round-trip is required during prelaunch development.
    if (decision !== "approved") {
      try { sessionStorage.removeItem(PENDING_EVENT_PROPOSAL); } catch { /* storage is optional */ }
      setDecided(true);
      respond(decision);
      return;
    }
    setSubmitting(true);
    setError(null);
    setLastDecision(decision);

    try {
      const normalizedDraft = EventDraftStateSchema.parse(draft);
      const freshProposal = await buildEventReviewProposal(normalizedDraft, proposalId);
      const stableId = recoverProposalId(freshProposal.draftHash, proposalId);
      const proposal = stableId === proposalId
        ? freshProposal
        : await buildEventReviewProposal(normalizedDraft, stableId);
      const res = await fetch("/api/approval-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          draft: proposal.draft,
          proposalId: proposal.proposalId,
          baseVersion: proposal.baseVersion,
          draftHash: proposal.draftHash,
          approvalRequestId,
        }),
      });
      const json = (await res.json()) as ApprovalCommitResponse;
      if (json.approvalRequestId) setApprovalRequestId(json.approvalRequestId);

      const outcome = resolveApprovalCommit(decision, res.ok, json);
      if (outcome.kind === "error") {
        // Includes the "approved but no eventId/slug" case — do NOT respond as
        // approved and do NOT lock the panel, so the host can retry.
        setError(outcome.message);
        setSubmitting(false);
        return;
      }

      if (outcome.kind === "published") {
        const savedReceipt = eventPublishReceipt(proposal.proposalId, outcome);
        try {
          sessionStorage.removeItem(PENDING_EVENT_PROPOSAL);
          storeCompletedPublish({
            draftHash: proposal.draftHash,
            reviewId,
            proposalId: proposal.proposalId,
            eventId: outcome.eventId,
            slug: outcome.slug,
            approvalRequestId: outcome.approvalRequestId,
            savedAt: savedReceipt.savedAt ?? new Date().toISOString(),
          });
        } catch { /* storage is optional */ }
        setReceipt(savedReceipt);
        onPublished?.({
          eventId: outcome.eventId,
          slug: outcome.slug,
          approvalRequestId: outcome.approvalRequestId,
        });
      }
      // Edit and Cancel change the local wizard state only. Do not invent
      // a persisted "saved" receipt when no database write occurred.
      setDecided(true);
      respond(decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval commit failed");
      setSubmitting(false);
    }
  }

  return (
    <Card
      className="mx-2 my-3 max-w-lg border-primary/30 sm:mx-4"
      data-testid="host-event-approval-panel"
    >
      <CardHeader>
        <CardTitle>Ready to publish?</CardTitle>
        <CardDescription>
          Review your event preview. Publishing makes tickets available to buyers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <EventCard {...preview} />
        <div
          data-testid="host-event-review-details"
          className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm"
        >
          <p className="font-medium">Details that will be published</p>
          <p>Capacity: {draft.capacity} people</p>
          {draft.description.trim() ? <p>Description: {draft.description}</p> : null}
          {draft.ticketTiers.length > 0 ? (
            <ul aria-label="Ticket tiers" className="list-inside list-disc space-y-1">
              {draft.ticketTiers.map((tier, index) => (
                <li key={index}>
                  {tier.name}: {tier.priceCop.toLocaleString("en-US")} COP · {tier.quantity} tickets
                </li>
              ))}
            </ul>
          ) : (
            <p>Ticket price: {draft.priceMinCop.toLocaleString("en-US")} COP</p>
          )}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {receipt ? (
          <div
            data-testid="host-event-approval-receipt"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          >
            <p className="font-medium">{receipt.message}</p>
            {receipt.readbackUrl ? (
              <a className="mt-1 inline-block font-medium text-primary hover:underline" href={receipt.readbackUrl}>
                View published event
              </a>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      {status === "executing" && !decided ? (
        <CardFooter className="flex flex-wrap gap-2">
          {error && lastDecision ? (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => commit(lastDecision)}
            >
              Try again
            </Button>
          ) : null}
          <Button
            type="button"
            data-testid="host-event-approve"
            disabled={submitting}
            onClick={() => commit("approved")}
          >
            Publish event
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="host-event-edit"
            disabled={submitting}
            onClick={() => commit("edit")}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="destructive"
            data-testid="host-event-reject"
            disabled={submitting}
            onClick={() => commit("rejected")}
          >
            Cancel
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
