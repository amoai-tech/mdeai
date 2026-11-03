"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HostOsBody } from "@/components/host/host-os-body";
import { HostOsProviders } from "@/components/host/host-os-provider";
import { deriveHostOsRouteLabel } from "@/lib/host/host-os-nav";

/**
 * SAN-1577 — the /app Events workspace body.
 *
 * The /app AppShell already owns the page header, workspace switcher, and the
 * single `<main>`. This component adds only the Host OS workspace furniture:
 * one `hostOpsAgent` provider, one persistent chat, and the workspace nav. It
 * is rendered by the /app/events route-group layout so it survives client-side
 * navigation across Overview, Events and Analytics.
 */
// skipcq: JS-0067 - ES module export; not browser global scope
export function HostOsWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeLabel = deriveHostOsRouteLabel(pathname);

  return (
    <HostOsProviders>
      <div
        data-testid="host-os-workspace"
        className="flex min-h-[70vh] min-w-0 flex-col bg-background text-foreground"
      >
        <HostOsBody routeLabel={routeLabel} basePath="/app/events">
          {children}
        </HostOsBody>
      </div>
    </HostOsProviders>
  );
}
