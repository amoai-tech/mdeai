"use client";

import { useState, type ReactNode } from "react";
import {
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
  type CopilotKitProviderProps,
} from "@copilotkit/react-core/v2";
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";
import { HostContextProvider } from "@/components/host/host-context-provider";
import { useSession } from "@/hooks/use-session";
import { selectHostThread, type HostThreadSelection } from "@/lib/host/host-thread-id";

/**
 * SAN-1577 — the ONE CopilotKit boundary for the host workspace.
 *
 * Both the legacy Host OS shell and the /app Events workspace render this
 * component, so there is exactly one `hostOpsAgent` provider/thread no matter
 * which URL family the organizer is using. The browser remembers the selected
 * thread per authenticated user, while Mastra owns messages and the server
 * enforces thread resource ownership. This survives both client navigation and
 * a full page reload without introducing another conversation store.
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
function HostOsRuntimeProvider({
  children,
  selection,
}: {
  children: ReactNode;
  selection?: HostThreadSelection;
}) {
  return (
    <CopilotKitProvider
      {...getCopilotKitClientProps("hostOpsAgent")}
      enableInspector={false}
      onError={handleHostCopilotError}
    >
      <CopilotChatConfigurationProvider
        agentId="hostOpsAgent"
        threadId={selection?.threadId}
        hasExplicitThreadId={selection?.restored ?? false}
      >
        <HostContextProvider>{children}</HostContextProvider>
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}

/** Mounted only after the authenticated user is known; never reads storage during SSR. */
function SignedInHostOsProviders({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string;
}) {
  const [selection] = useState(() =>
    selectHostThread(userId, window.sessionStorage, () => crypto.randomUUID()),
  );
  return <HostOsRuntimeProvider selection={selection}>{children}</HostOsRuntimeProvider>;
}

// skipcq: JS-0067 - ES module export; not browser global scope
export function HostOsProviders({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="p-4 text-sm text-muted-foreground">
        Loading host workspace…
      </div>
    );
  }
  if (!user) return <HostOsRuntimeProvider>{children}</HostOsRuntimeProvider>;
  return (
    <SignedInHostOsProviders key={user.id} userId={user.id}>
      {children}
    </SignedInHostOsProviders>
  );
}
