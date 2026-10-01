"use client";

import { useCallback, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
  type CopilotKitProviderProps,
} from "@copilotkit/react-core/v2";
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";
import { HostContextProvider } from "@/components/host/host-context-provider";
import { HostOsHeader } from "@/components/host/host-os-header";
import { HostOsBody, CHAT_REGION_ID } from "@/components/host/host-os-body";
import { deriveHostOsRouteLabel } from "@/lib/host/host-os-nav";

/**
 * SAN-1209 · HOST-OS-001 — Unified Host OS Shell.
 *
 * The single frame for Roberto's whole host workspace (Overview · Events ·
 * Analytics). Before this, each host page mounted its OWN nav rail + its OWN
 * CopilotChat under its OWN CopilotKit provider — so walking from Dashboard to
 * Analytics crossed a provider boundary and the conversation reset. This shell
 * lifts ONE `hostOpsAgent` provider, ONE persistent chat, ONE nav, and the
 * shared header/context above the routed pages, so the frame (and the
 * conversation) survive client-side navigation between host screens.
 *
 * Rendered once by `src/app/host/layout.tsx` for the OS routes; the marketing
 * landing (`/host`), the event wizard (`/host/event*`, own provider) and the
 * real-estate broker area (`/host/rentals*`) stay passthrough.
 */


/** The v2 provider's error event, `{ error, code, context }`, replacing the v1 shape. */
type CopilotErrorEvent = Parameters<NonNullable<CopilotKitProviderProps["onError"]>>[0];

/**
 * Module-level (stable reference) so passing it to the provider doesn't create a
 * new prop identity each render — a fresh `onError` ref can retrigger the agent
 * connect loop. In CopilotKit v2 agent-discovery / runtime errors surface here
 * (the provider does NOT throw), so without this handler a failed hostOpsAgent
 * connection fails silently. We log a diagnostic breadcrumb; the page body and
 * the persistent rail are still protected by <HostErrorBoundary> in HostOsBody.
 */
// skipcq: JS-0067 - module-local error handler; not browser global scope
function handleHostCopilotError(errorEvent: CopilotErrorEvent): void {
  console.error("[hostOpsAgent copilot error]", errorEvent);
}

// skipcq: JS-0067 - ES module export; not browser global scope
export function HostOsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeLabel = deriveHostOsRouteLabel(pathname);

  const focusChat = useCallback(() => {
    const region = document.getElementById(CHAT_REGION_ID);
    region?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const input = region?.querySelector<HTMLElement>("textarea, input");
    input?.focus();
  }, []);

  return (
    <CopilotKitProvider
      {...getCopilotKitClientProps("hostOpsAgent")}
      enableInspector={false}
      onError={handleHostCopilotError}
    >
      {/*
        One thread for the whole host workspace. With no threadId the
        configuration provider mints it once per mount, so it survives
        client-side navigation between Overview, Events and Analytics (this
        shell is rendered by the host layout and does not remount between
        them) and is shared by the chat and every host tool and hook.
      */}
      <CopilotChatConfigurationProvider agentId="hostOpsAgent">
        <HostContextProvider>
          <div
            data-testid="host-os-shell"
            className="flex min-h-screen flex-col bg-background text-foreground"
          >
            <HostOsHeader routeLabel={routeLabel} onAskAi={focusChat} />
            <HostOsBody routeLabel={routeLabel}>{children}</HostOsBody>
          </div>
        </HostContextProvider>
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}
