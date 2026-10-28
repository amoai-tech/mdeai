"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAgentContext,
  useFrontendTool,
  useHumanInTheLoop,
} from "@copilotkit/react-core/v2";
import { z } from "zod";
import { EventPublishApprovalPanel } from "@/components/host/event-publish-approval-panel";
import {
  applySetEventDraft,
  publishDecisionDraftPatch,
  selectPublishDraft,
} from "@/lib/events/host-event-wizard-tool-handlers";
import type { ApprovalDecision } from "@/lib/events/approval-decision";
import {
  EMPTY_EVENT_DRAFT,
  EventDraftStateSchema,
  mergeEventDraft,
  type EventDraftState,
} from "@/lib/types";

const setEventDraftParams = EventDraftStateSchema.pick({
  title: true,
  neighborhood: true,
  dateIso: true,
  venue: true,
  capacity: true,
  priceMinCop: true,
  description: true,
  ticketTiers: true,
}).partial();

const previewPublishParams = z.object({
  draft: EventDraftStateSchema,
});

type HostEventCopilotBridgeProps = {
  children: (ctx: {
    draft: EventDraftState;
    setDraft: (patch: Partial<EventDraftState>) => void;
  }) => React.ReactNode;
};

type HitlRenderProps = {
  args: Partial<{ draft: EventDraftState }>;
  toolCallId?: string;
  status: "inProgress" | "executing" | "complete";
  respond?: (result: unknown) => Promise<void>;
};

function createPublishHitlRender(
  getLatestDraft: () => EventDraftState,
  setDraft: (patch: Partial<EventDraftState>) => void,
) {
  return function HostEventPublishHitlRender({
    args,
    toolCallId,
    status,
    respond,
  }: HitlRenderProps) {
    // The stable CopilotKit callback must read the latest reviewed form data.
    const draftArg = selectPublishDraft(args.draft, getLatestDraft());
    const panelStatus =
      status === "inProgress"
        ? "inProgress"
        : status === "executing"
          ? "executing"
          : "complete";

    return (
      <EventPublishApprovalPanel
        draft={draftArg}
        reviewId={toolCallId}
        status={panelStatus}
        onPublished={({ eventId, slug, approvalRequestId }) => {
          setDraft({
            status: "published",
            publishedEventId: eventId,
            publishedSlug: slug,
            approvalRequestId,
          });
        }}
        respond={(decision: ApprovalDecision) => {
          const patch = publishDecisionDraftPatch(decision);
          if (patch) setDraft(patch);
          void respond?.(decision);
        }}
      />
    );
  };
}

export function HostEventCopilotBridge({ children }: HostEventCopilotBridgeProps) {
  const [draft, setDraftState] = useState<EventDraftState>(EMPTY_EVENT_DRAFT);

  const setDraft = useCallback((patch: Partial<EventDraftState>) => {
    setDraftState((prev) => mergeEventDraft(prev, patch));
  }, []);

  // Canonical wizard state is owned by this component. Frontend tools and manual
  // edits both write through setDraftState; stale Mastra working memory must not
  // replace the fields the host has just reviewed and edited.
  const latestDraftRef = useRef(draft);
  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  useAgentContext({
    description: "Roberto's in-progress event draft for the host wizard",
    value: draft,
  });

  // SAN-905 · skip agent.setState on every draft edit — mid-stream pushes
  // caused extra CopilotKit turns and Gemini thought_signature replay errors.

  useFrontendTool(
    {
      name: "set_event_draft",
      description:
        "Apply every event detail the host stated in one call: title, neighborhood, dateIso, venue, capacity, priceMinCop (whole COP), description, optional ticket tiers. Returns the updated draft so the assistant can continue or ask for missing fields.",
      parameters: setEventDraftParams,
      handler: async (args) => {
        const next = applySetEventDraft(latestDraftRef.current, args);
        latestDraftRef.current = next;
        setDraftState(next);
        return { ok: true, draft: next };
      },
    },
    [],
  );

  // Creating the getter doesn't read the ref during bridge render. CopilotKit
  // calls it later when an actual publish review is rendered.
  const getLatestDraft = useCallback(() => latestDraftRef.current, []);
  // Keep the HITL tool stable across form edits, but never capture a stale draft.
  const PublishHitlRender = useMemo(
    // eslint-disable-next-line react-hooks/refs -- Factory stores the getter but never invokes it during registration; the HITL panel invokes it after commit.
    () => createPublishHitlRender(getLatestDraft, setDraft),
    [getLatestDraft, setDraft],
  );

  useHumanInTheLoop(
    {
      name: "preview_and_publish",
      description: "Show HITL publish approval panel when the draft is complete",
      parameters: previewPublishParams,
      render: PublishHitlRender,
    },
    [PublishHitlRender],
  );

  return <>{children({ draft, setDraft })}</>;
}
