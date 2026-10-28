"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { submitDirectVenueBooking } from "@/components/chat/venue-booking-direct-hitl-core";
import { clearVenueBookingReview } from "@/components/chat/venue-booking-draft-store";
import { useHumanInTheLoop } from "@copilotkit/react-core/v2";
import {
  VenueBookingHitlPanel,
  type VenueBookingHitlArgs,
} from "@/components/chat/venue-booking-hitl-panel";
import { useRentalUi } from "@/components/chat/rental-ui-context";
import { useSearchToolRenders } from "@/components/copilot/search-tool-renders";
import {
  MASTRA_COPILOT_TOOL_ACTIONS,
  MASTRA_TOOL_IDS,
} from "@/platform/copilot/mastra-tool-action-names";
import { venueBookingRequestSchema } from "@/lib/venues/venue-booking-form-schema";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";

function VenueBookingResultBannerSync({
  result,
  venueTitle,
}: {
  result: unknown;
  venueTitle: string;
}) {
  const { setVenueBookingConfirmation } = useRentalUi();
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!result || typeof result !== "object") return;
    const payload = result as {
      success?: boolean;
      requestId?: string;
      message?: string;
      venueTitle?: string;
    };
    if (!payload.success || !payload.requestId || !payload.message) return;
    if (syncedRef.current === payload.requestId) return;
    syncedRef.current = payload.requestId;
    setVenueBookingConfirmation({
      requestId: payload.requestId,
      message: payload.message,
      venueTitle: payload.venueTitle ?? venueTitle,
    });
  }, [result, setVenueBookingConfirmation, venueTitle]);

  return null;
}

type HitlRenderProps = {
  args: Partial<VenueBookingHitlArgs>;
  status: "inProgress" | "executing" | "complete";
  result?: unknown;
  respond?: (result: unknown) => Promise<void>;
};

function createVenueBookingHitlRender() {
  return function VenueBookingHitlRender({
    args,
    status,
    result,
    respond,
  }: HitlRenderProps) {
    // CopilotKit streams tool arguments incrementally. Mount review only after
    // the complete, validated proposal is available; normalize the model's
    // venue-local/offset time to UTC before the first render and before Send.
    // A partial argument object must never be captured as an editable draft.
    const validated = venueBookingRequestSchema.safeParse(args);
    if (!validated.success) return null;
    const hitlArgs = validated.data as VenueBookingHitlArgs;

    const venueTitle = hitlArgs.venueTitle?.trim() || hitlArgs.placeId || hitlArgs.restaurantId || "Restaurant";

    return (
      <>
        {status === "complete" ? (
          <VenueBookingResultBannerSync
            result={result}
            venueTitle={venueTitle}
          />
        ) : null}
        <VenueBookingHitlPanel
          args={hitlArgs}
          status={status}
          respond={async (decision, draft) => {
            if (!respond) throw new Error("Booking confirmation is unavailable. Try again.");
            if (decision === "rejected") {
              clearVenueBookingReview();
              await respond({ success: false, message: "Customer cancelled the request; nothing saved." });
              return;
            }
            // Only the explicit customer action invokes the authenticated writer.
            // The Mastra tool by itself is proposal-only and cannot insert.
            const saved = await submitDirectVenueBooking(draft);
            if (!saved.ok) {
              throw saved.error instanceof Error ? saved.error : new Error("Could not save the booking request.");
            }
            await respond({
              success: true,
              requestId: saved.confirmation.requestId,
              message: saved.confirmation.message,
              venueTitle: saved.confirmation.venueTitle,
            });
            clearVenueBookingReview();
          }}
        />
      </>
    );
  };
}

type ConciergeCopilotBridgeProps = {
  children: ReactNode;
};

function LiveConciergeCopilotBridge({ children }: ConciergeCopilotBridgeProps) {
  useSearchToolRenders();
  const VenueBookingHitlRender = useMemo(
    () => createVenueBookingHitlRender(),
    [],
  );

  useHumanInTheLoop(
    {
      name: MASTRA_COPILOT_TOOL_ACTIONS.venueBooking,
      description:
        "Show booking confirmation card before inserting a venue_booking_requests row",
      parameters: venueBookingRequestSchema,
      render: VenueBookingHitlRender,
    },
    [VenueBookingHitlRender],
  );

  useHumanInTheLoop(
    {
      name: MASTRA_TOOL_IDS.venueBooking,
      description:
        "Show booking confirmation card before inserting a venue_booking_requests row",
      parameters: venueBookingRequestSchema,
      render: VenueBookingHitlRender,
    },
    [VenueBookingHitlRender],
  );

  return <>{children}</>;
}

/** Skip CopilotKit tool/HITL registration in deterministic local E2E. */
export function ConciergeCopilotBridge({
  children,
}: ConciergeCopilotBridgeProps) {
  if (isDeterministicE2E()) {
    return <>{children}</>;
  }
  return <LiveConciergeCopilotBridge>{children}</LiveConciergeCopilotBridge>;
}
