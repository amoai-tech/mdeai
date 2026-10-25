"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
} from "@copilotkit/react-core/v2";
import { ConciergeCoAgentProvider } from "@/components/chat/concierge-coagent-context";
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";
import { reportConciergeError } from "@/lib/concierge-error-store";
import { ThreadNavProvider, useThreadNav } from "@/lib/chat/thread-nav-context";
import { isAgentlessRoute } from "@/lib/copilot/agentless-routes";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";

// A discovery-page provider mounts only when its route needs concierge AI.
// Capture replay eligibility at this provider's mount, not at the root layout's mount:
// a newly persisted turn must not reconnect into itself while its answer is visible.
function DiscoveryConciergeProvider({ children }: { children: ReactNode }) {
  const { activeThreadId, sessionThreadId, hasPersistedThread, restoredThread } = useThreadNav();
  const [initialRestorableThread] = useState(() => hasPersistedThread ? sessionThreadId : undefined);
  const shouldReplay = Boolean(activeThreadId || restoredThread ||
    (hasPersistedThread && initialRestorableThread === sessionThreadId));

  return (
    <CopilotKitProvider
      {...getCopilotKitClientProps("conciergeAgent")}
      onError={() => reportConciergeError(activeThreadId ?? sessionThreadId)}
    >
      <CopilotChatConfigurationProvider
        agentId="conciergeAgent"
        threadId={activeThreadId ?? sessionThreadId}
        hasExplicitThreadId={shouldReplay}
      >
        <ConciergeCoAgentProvider>{children}</ConciergeCoAgentProvider>
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}

// skipcq: JS-0067 - module-local helper; not browser global scope
function CopilotKitWithThread({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const deterministicE2E = isDeterministicE2E();

  // Deterministic browser tests exercise the real app/router with mocked
  // domain boundaries, but must not start live CopilotKit transport.
  if (deterministicE2E) {
    return <>{children}</>;
  }

  // Routes that own their agent surface, or have none at all, must not also get
  // the root conciergeAgent:
  //  - /login, /signup, /auth/* → no agents
  //  - /chat                    → public concierge layout provider
  //  - /host/event*             → event wizard (hostEventAgent)
  //  - Host OS routes           → HostOsShell (hostOpsAgent)
  //  - /app                     → shell only in Phase 1; /app/events mounts the
  //                               Host OS shell. A future contextual chat mounts
  //                               its own provider in the page that needs it.
  if (isAgentlessRoute(pathname)) {
    return <>{children}</>;
  }

  return <DiscoveryConciergeProvider>{children}</DiscoveryConciergeProvider>;
}

/** Client wrapper so `onError` can be passed to the provider without Server Component restrictions. */
export function MdeCopilotKitProvider({ children }: { children: ReactNode }) {
  return (
    <ThreadNavProvider>
      <CopilotKitWithThread>{children}</CopilotKitWithThread>
    </ThreadNavProvider>
  );
}
