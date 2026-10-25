"use client";

import type { ReactNode } from "react";
import { AppErrorBoundary } from "@/components/errors/error-boundary";

/**
 * SAN-1209-FIX — Host OS error isolation.
 *
 * Production incident: the unified Host OS shell rendered its header + nav, but
 * the page body (and the Copilot rail) went blank on /host/dashboard,
 * /host/events and /host/analytics. A throw inside the shared client subtree
 * (e.g. the persistent <CopilotChat>/hostOpsAgent runtime connection) unmounted
 * to the nearest boundary — and there was none — so React discarded the body
 * silently. No fallback, no console breadcrumb.
 *
 * This boundary makes any such crash *visible and contained*: the rest of the
 * page keeps rendering, the operator sees a labelled fallback, and the real
 * error is logged so prod can be diagnosed without a debugger.
 *
 * The implementation is the shared `AppErrorBoundary`; this wrapper keeps the
 * established `[host-os <label> crashed]` breadcrumb and the existing call sites.
 *
 * Reset strategy: no internal recovery. The Host OS shell stays mounted across
 * /host/* navigation, so HostOsBody keys the page-body boundary by pathname
 * (`key={pathname}`) to remount it with fresh state on each route change; the
 * host segment `error.tsx` exposes `reset()`.
 */
export function HostErrorBoundary({
  children,
  fallback,
  label,
}: {
  children: ReactNode;
  fallback: ReactNode;
  label: string;
}) {
  return (
    <AppErrorBoundary fallback={fallback} label={label} scope="host-os">
      {children}
    </AppErrorBoundary>
  );
}
