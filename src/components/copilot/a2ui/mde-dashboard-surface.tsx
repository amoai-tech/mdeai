"use client";

import { useLayoutEffect, type ReactNode } from "react";
import {
  SurfaceView,
  useGenerativeUIRuntime,
  useManagerVersion,
} from "@copilotkit/react-core/v2/generative-ui/native";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";

/**
 * SAN-1675 — render official Standard Catalog components from real page data,
 * with no AI turn.
 *
 * CopilotKit 1.88 has no "static surface" prop, so this uses the two public
 * pieces `<GenerativeUISurface>` itself is made of: the provider's surface
 * manager (`manager.ingest`, which validates every operation against `mdeUI`)
 * and `SurfaceView` (the official renderer). The surface lives on a dashboard
 * thread no agent writes to, and no target is registered, so the model can
 * neither see nor overwrite it.
 *
 * Re-ingesting new operations (for example after `router.refresh()`) rebuilds
 * the surface but keeps every value the user typed (the manager's owned paths),
 * so a refresh never wipes an edit in progress.
 *
 * The route owns the existing provider; the dashboard never mounts a second
 * provider or starts an AI run. Transport-free tests see the honest fallback.
 */
export const MDE_DASHBOARD_THREAD_ID = "mde-dashboard";

type Operations = readonly Record<string, unknown>[];

type MdeDashboardSurfaceProps = {
  surfaceId: string;
  operations: Operations;
  /** Shown before the surface exists, without a provider, or when it fails validation. */
  fallback: ReactNode;
  /** Function registrars (`useGenerativeUIFunction`) that must live inside the provider. */
  children?: ReactNode;
  className?: string;
};

function DashboardSurfaceView({ surfaceId, operations, fallback, children, className }: MdeDashboardSurfaceProps) {
  const runtime = useGenerativeUIRuntime();
  useManagerVersion(runtime);

  useLayoutEffect(() => {
    if (!runtime) return;
    // The installed manager fingerprints committed operations and no-ops identical
    // content; changed operations must still reach it after a data refresh.
    runtime.manager.ingest(MDE_DASHBOARD_THREAD_ID, undefined, {
      surfaceId,
      target: surfaceId,
      catalogId: mdeUI.id,
      operations: operations as never,
      status: "ready",
      rejected: [],
    });
  }, [runtime, surfaceId, operations]);

  const surface = runtime?.manager.getSurface(MDE_DASHBOARD_THREAD_ID, surfaceId);
  const failed = !surface || surface.failed || surface.clientRejected.length > 0;
  if (failed && surface?.clientRejected.length) {
    // A rejected operation is a bug in our own builder, not user input: surface it to developers.
    console.error("[MdeDashboardSurface] Surface rejected", { surfaceId, rejected: surface.clientRejected });
  }

  return (
    <>
      {children}
      {failed ? fallback : (
        <div data-generative-ui-surface={surfaceId} data-testid={`mde-surface-${surfaceId}`} className={className}>
          <SurfaceView surface={surface} />
        </div>
      )}
    </>
  );
}

export function MdeDashboardSurface(props: MdeDashboardSurfaceProps) {
  const runtime = useGenerativeUIRuntime();
  if (runtime) return <DashboardSurfaceView {...props} />;
  return <>{props.fallback}</>;
}
