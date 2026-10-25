"use client";

import type { ReactNode } from "react";
import {
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
  type CopilotKitProviderProps,
} from "@copilotkit/react-core/v2";
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";
import { HostContextProvider } from "@/components/host/host-context-provider";

/**
 * SAN-1577 — the ONE CopilotKit boundary for the host workspace.
 *
 * Both the legacy Host OS shell and the /app Events workspace render this
 * component, so there is exactly one `hostOpsAgent` provider/thread no matter
 * which URL family the organizer is using. The configuration provider mints one
 * non-explicit thread per mount, shared by the persistent chat and every host
 * tool/hook; the layout that renders this component stays mounted across
 * Overview → Events → Analytics.
 */

/** The v2 provider's error event, `{ error, code, context }`, replacing the v1 shape. */
type CopilotErrorEvent = Parameters<NonNullable<CopilotKitProviderProps["onError"]>>[0];

/**
 * Module-level (stable reference) so passing it to the provider doesn't create a
 * new prop identity each render — a fresh `onError` ref can retrigger the agent
 * connect loop. In CopilotKit v2 agent-discovery / runtime errors surface here
 * (the provider does NOT throw), so without this handler a failed hostOpsAgent
 * connection fails silently.
 */
// skipcq: JS-0067 - module-local error handler; not browser global scope
function handleHostCopilotError(errorEvent: CopilotErrorEvent): void {
  console.error("[hostOpsAgent copilot error]", errorEvent);
}

// skipcq: JS-0067 - ES module export; not browser global scope
export function HostOsProviders({ children }: { children: ReactNode }) {
  return (
    <CopilotKitProvider
      {...getCopilotKitClientProps("hostOpsAgent")}
      enableInspector={false}
      onError={handleHostCopilotError}
    >
      <CopilotChatConfigurationProvider agentId="hostOpsAgent">
        <HostContextProvider>{children}</HostContextProvider>
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}
