"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useGenerativeUIFunction } from "@copilotkit/react-core/v2/generative-ui";
import { MdeDashboardSurface } from "@/components/copilot/a2ui/mde-dashboard-surface";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import type { BrokerDashboardView } from "@/lib/rentals/broker-dashboard-types";
import { availableBrokerViewingActions } from "@/lib/rentals/broker-viewing-action";
import {
  BROKER_OVERVIEW_SURFACE_ID,
  buildBrokerOverviewOperations,
} from "@/lib/rentals/broker-overview-ui";
import { submitBrokerViewingAction } from "@/lib/rentals/submit-broker-viewing-action";

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

type ActionArgs = { showingId: string; action: "confirm" | "cancel" | "reschedule"; newWallClock?: string };

/**
 * Handles `brokerViewingAction` for the Overview surface. The surface passes
 * only a showing ID; the record, its persisted status and its persisted time
 * come from the RLS-scoped page data. One call per showing at a time, so a
 * double click cannot send two writes; the server's expectation check (409)
 * covers a stale page.
 */
function BrokerViewingFunction({
  view,
  onStatus,
}: {
  view: BrokerDashboardView;
  onStatus: (message: string | null) => void;
}) {
  const router = useRouter();
  const latest = useRef({ view, onStatus });
  const pending = useRef(new Set<string>());
  useLayoutEffect(() => {
    latest.current = { view, onStatus };
  }, [view, onStatus]);

  useGenerativeUIFunction(mdeUI, "brokerViewingAction", async ({ showingId, action, newWallClock }: ActionArgs) => {
    const fail = (error: string) => {
      latest.current.onStatus(error);
      return { ok: false, error };
    };
    const request = latest.current.view.viewingRequests.find((row) => row.showingId === showingId);
    if (!request) return fail("This viewing request is no longer on this page. Refresh and try again.");
    if (!availableBrokerViewingActions(request.status).includes(action)) {
      return fail("That action is not available for this request any more. Refresh and try again.");
    }
    if (action === "reschedule" && !(newWallClock && WALL_CLOCK.test(newWallClock))) {
      return fail("Pick the new date and time first.");
    }
    if (pending.current.has(showingId)) return { ok: false, error: "Already updating this request." };
    pending.current.add(showingId);
    latest.current.onStatus("Updating…");
    try {
      const result = await submitBrokerViewingAction({
        showingId,
        action,
        expectedStatus: request.status,
        expectedScheduledAt: request.scheduledAt,
        newWallClock: action === "reschedule" ? newWallClock : undefined,
      });
      if (!result.ok) return fail(result.error);
      latest.current.onStatus("Saved. Refreshing…");
      // Re-read the Server Component: the surface shows only what the database committed.
      router.refresh();
      return { ok: true, status: "saved" };
    } finally {
      pending.current.delete(showingId);
    }
  });
  return null;
}

export function BrokerOverviewSurface({
  dashboard,
  fallback,
}: {
  dashboard: BrokerDashboardView;
  fallback: ReactNode;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const operations = useMemo(() => buildBrokerOverviewOperations(dashboard), [dashboard]);
  return (
    <div className="space-y-2">
      <MdeDashboardSurface surfaceId={BROKER_OVERVIEW_SURFACE_ID} operations={operations} fallback={fallback}>
        <BrokerViewingFunction view={dashboard} onStatus={setStatus} />
      </MdeDashboardSurface>
      {status ? (
        <p role="status" data-testid="broker-overview-status" className="text-xs text-muted-foreground">
          {status}
        </p>
      ) : null}
    </div>
  );
}
