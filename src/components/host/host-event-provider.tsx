"use client";

import {
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
} from "@copilotkit/react-core/v2";
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";

/**
 * Fresh thread per wizard session avoids stale thought_signature history.
 *
 * The configuration provider owns that thread: with no `threadId` it mints one
 * UUID per mount, stable across re-renders, shared by every CopilotKit consumer
 * in the wizard, and non-explicit, so a fresh wizard shows its welcome state
 * instead of trying to reconnect to a thread that does not exist yet.
 */
export function HostEventProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CopilotKitProvider {...getCopilotKitClientProps("hostEventAgent")} enableInspector={false}>
      <CopilotChatConfigurationProvider agentId="hostEventAgent">
        {children}
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}
