"use client";

import type { ReactNode } from "react";
import { HostOsWorkspace } from "@/components/host/host-os-workspace";

/**
 * SAN-1577 — one mounted workspace for /app/events, /overview and /analytics.
 *
 * The route-group layout keeps the Host OS provider, workspace nav and single
 * chat mounted across the three pages. The /app AppShell above it still owns the
 * page header and the only `<main>`; this layout adds no duplicate chrome.
 */
export default function AppEventsWorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <HostOsWorkspace>{children}</HostOsWorkspace>;
}
