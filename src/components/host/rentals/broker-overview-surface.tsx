"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useGenerativeUIFunction } from "@copilotkit/react-core/v2/generative-ui";
import { useGenerativeUIRuntime } from "@copilotkit/react-core/v2/generative-ui/native";
import { MDE_DASHBOARD_THREAD_ID, MdeDashboardSurface } from "@/components/copilot/a2ui/mde-dashboard-surface";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import type { BrokerDashboardView } from "@/lib/rentals/broker-dashboard-types";
import { BROKER_ASK_MDE_EVENT } from "@/lib/rentals/broker-ask-mde";
import { availableBrokerViewingActions } from "@/lib/rentals/broker-viewing-action";
import {
  BROKER_OVERVIEW_SURFACE_ID,
  buildBrokerOverviewOperations,
  rescheduleDraftPath,
} from "@/lib/rentals/broker-overview-ui";
import { STALE_VIEWING_ACTION_MESSAGE, submitBrokerViewingAction } from "@/lib/rentals/submit-broker-viewing-action";

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

type ActionArgs = { rendererKey: string; showingId: string; expectedStatus: string; expectedScheduledAt: string; action: "confirm" | "cancel" | "reschedule"; newWallClock?: string };
type NavigateArgs = { rendererKey: string; target: "listings" | "new_listing" | "ask_mde" };

/**
 * Handles the Overview's two renderer-only functions. The surface passes a
 * private mount key with every call; only this app-authored surface receives it,
 * and the model can never call either function.
 *
 * - `brokerViewingAction` resolves the record, persisted status and time from the
 *   RLS-scoped page data, then calls the existing PATCH route (409 on a stale page).
 * - `brokerOverviewNavigate` maps a closed set of destinations to real routes.
 */
function BrokerOverviewFunctions({
  view,
  rendererKey,
  basePath,
  onStatus,
  onSaved,
}: {
  view: BrokerDashboardView;
  rendererKey: string;
  basePath: string;
  onStatus: (message: string | null) => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const runtime = useGenerativeUIRuntime();
  const latest = useRef({ view, onStatus, onSaved });
  const pending = useRef(new Set<string>());
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => {
    // Discard a draft when the underlying request changes or leaves the page.
    // Versioned paths also keep the old value out of the new date picker.
    const surface = runtime?.manager.getSurface(MDE_DASHBOARD_THREAD_ID, BROKER_OVERVIEW_SURFACE_ID);
    if (surface && runtime) {
      const currentRows = [...view.todaySchedule, ...view.upcomingPreview, ...view.viewingRequests];
      for (const previous of [...latest.current.view.todaySchedule, ...latest.current.view.upcomingPreview, ...latest.current.view.viewingRequests]) {
        const current = currentRows.find((row) => row.showingId === previous.showingId);
        if (!current || current.status !== previous.status || current.scheduledAt !== previous.scheduledAt) {
          const path = rescheduleDraftPath(previous);
          if (surface.model.dataModel.get(path) != null) {
            runtime.manager.setOwnedValue(surface.key, path, null);
          }
        }
      }
    }
    latest.current = { view, onStatus, onSaved };
  }, [view, onStatus, onSaved, runtime]);

  useGenerativeUIFunction(mdeUI, "brokerOverviewNavigate", async ({ rendererKey: suppliedKey, target }: NavigateArgs) => {
    if (suppliedKey !== rendererKey || !mounted.current) {
      return { ok: false, error: "Open Overview to use this action." };
    }
    if (target === "listings") router.push(`${basePath}/listings`);
    else if (target === "new_listing") router.push(`${basePath}/onboarding`);
    else if (basePath === "/app/rentals") {
      // SAN-1685 — open the one persistent bottom chat in place. This is the
      // same signal the account header dispatches; it never mounts a second
      // provider and never navigates away from Overview.
      window.dispatchEvent(new Event(BROKER_ASK_MDE_EVENT, { cancelable: true }));
    } else {
      // The legacy host overview has no bottom composer; open its concierge.
      router.push(basePath);
    }
    return { ok: true };
  });

  useGenerativeUIFunction(mdeUI, "brokerViewingAction", async ({ rendererKey: suppliedKey, showingId, expectedStatus, expectedScheduledAt, action, newWallClock }: ActionArgs) => {
    // Renderer-only still permits model-authored clickable buttons. Only the
    // private app-authored dashboard thread receives this per-mount key.
    // The server continues to enforce ownership and persisted expectations.
    if (suppliedKey !== rendererKey || !mounted.current) {
      return { ok: false, error: "Open the viewing request in Overview to manage it." };
    }
    const fail = (error: string) => {
      latest.current.onStatus(error);
      return { ok: false, error };
    };
    // Today and Upcoming rows are joined directly from the schedule queries, so a
    // request shown there may not be on the latest-created request page. Resolve
    // against every loaded row, never against the bounded table alone.
    const request = [
      ...latest.current.view.todaySchedule,
      ...latest.current.view.upcomingPreview,
      ...latest.current.view.viewingRequests,
    ].find((row) => row.showingId === showingId);
    if (!request) return fail("This viewing request is no longer on this page. Refresh and try again.");
    if (request.status !== expectedStatus || request.scheduledAt !== expectedScheduledAt) return fail(STALE_VIEWING_ACTION_MESSAGE);
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
        expectedStatus,
        expectedScheduledAt,
        newWallClock: action === "reschedule" ? newWallClock : undefined,
      });
      if (!result.ok) return fail(result.error);
      // Clear only the draft that was submitted. A newer edit while PATCH was in
      // flight (or an edit to another request) must survive the refresh.
      if (action === "reschedule" && runtime && mounted.current) {
        const surface = runtime.manager.getSurface(MDE_DASHBOARD_THREAD_ID, BROKER_OVERVIEW_SURFACE_ID);
        const path = rescheduleDraftPath(request);
        if (surface && surface.model.dataModel.get(path) === newWallClock) {
          runtime.manager.setOwnedValue(surface.key, path, null);
        }
      }
      if (mounted.current) latest.current.onSaved();
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
  basePath = "/app/rentals",
}: {
  dashboard: BrokerDashboardView;
  fallback: ReactNode;
  basePath?: string;
}) {
  const router = useRouter();
  const [rendererKey] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const onSaved = useCallback(() => {
    setStatus("Saved.");
    // The transition tracks the actual server refresh, not an arbitrary timer.
    startRefresh(() => router.refresh());
  }, [router]);
  const operations = useMemo(() => buildBrokerOverviewOperations(dashboard, rendererKey), [dashboard, rendererKey]);
  return (
    <div className="space-y-2">
      <MdeDashboardSurface surfaceId={BROKER_OVERVIEW_SURFACE_ID} operations={operations} fallback={fallback}>
        <BrokerOverviewFunctions
          view={dashboard}
          rendererKey={rendererKey}
          basePath={basePath}
          onStatus={setStatus}
          onSaved={onSaved}
        />
      </MdeDashboardSurface>
      {status ? (
        <p role="status" data-testid="broker-overview-status" className="text-xs text-muted-foreground">
          {status === "Saved." && refreshing ? "Saved. Refreshing…" : status}
        </p>
      ) : null}
    </div>
  );
}
