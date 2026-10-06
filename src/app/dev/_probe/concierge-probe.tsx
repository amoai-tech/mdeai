"use client";

import { useEffect, useRef } from "react";
import {
  CopilotChatConfigurationProvider,
  CopilotChatView,
  CopilotKitProvider,
  HttpAgent,
} from "@copilotkit/react-core/v2";
import { ConciergeCoAgentProvider } from "@/components/chat/concierge-coagent-context";
import {
  ConciergeMessageView,
  conciergeWelcomeScreen,
} from "@/components/chat/concierge-copilot-chat-view";
import { useTranscriptTailHasContent } from "@/components/chat/concierge-transcript-tail";
import { EventFastPathProvider } from "@/components/chat/event-fast-path-context";
import {
  EventLocalChatProvider,
  useEventLocalChat,
} from "@/components/chat/event-local-chat-context";
import { EventSearchResultsProvider } from "@/components/chat/event-search-results-context";
import { GroundedFastPathProvider } from "@/components/chat/grounded-fast-path-context";
import { RentalFastPathProvider } from "@/components/chat/rental-fast-path-context";
import { RestaurantFastPathProvider } from "@/components/chat/restaurant-fast-path-context";

/**
 * Dev-only browser probe: the REAL CopilotKit `CopilotChatView` with the app's own `messageView`
 * and welcome-screen rule, the real result contexts, and no live runtime. Used by the SAN-1357
 * long-chat proof and the SAN-966 result-order proof. The pages that mount it are gated to
 * deterministic E2E, so it can never reach a real user.
 *
 * `useAgent` throws unless the requested agent is registered or a runtime sync is pending/error
 * (installed react-core v2). The probe never starts a run, so the agent only has to exist;
 * registering it locally via `agents__unsafe_dev_only` is the escape hatch the library's own
 * error message points to. The URL is deliberately unreachable so any accidental transport fails
 * loudly instead of passing quietly.
 */
const PROBE_AGENT_ID = "conciergeAgent";
const PROBE_AGENTS = {
  [PROBE_AGENT_ID]: new HttpAgent({ url: "http://127.0.0.1:1/probe-agent-never-runs" }),
};

/** Seeds one local shortcut exchange through the real context, as the fast paths do. */
function SeedButton() {
  const { showExchange } = useEventLocalChat();
  return (
    <button
      type="button"
      data-testid="probe-seed"
      onClick={() => showExchange("Probe shortcut question", "Probe shortcut answer")}
    >
      Seed a shortcut exchange
    </button>
  );
}

/** The chat view exactly as the app wires it, minus the send handlers a probe does not need. */
function ProbeChat({ messages }: { messages: Array<{ id: string; role: "user" | "assistant"; content: string }> }) {
  const hasTailContent = useTranscriptTailHasContent();
  return (
    <CopilotChatView
      messages={messages}
      messageView={ConciergeMessageView}
      welcomeScreen={conciergeWelcomeScreen(hasTailContent, undefined)}
      // The view must FILL its fixed-height parent. Measured: without it the message list mounts
      // but reports `hidden`, because the view's own root collapses to zero height, which is
      // exactly the condition that disables virtualization.
      className="h-full min-h-0 w-full"
    />
  );
}

export function ConciergeProbe({
  messages,
  testId,
}: {
  messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
  testId: string;
}) {
  // Hydration proof. CopilotKit's `ScrollView` only provides `ScrollElementContext` from its own
  // mount effect, so an un-hydrated page shows only the server-rendered pre-mount branch, where
  // virtualization silently stays off and a click is silently dropped. This flag is set from an
  // effect for the same reason: if this effect ran, the others did too. A DOM attribute rather
  // than state, because the repo's lint rules reject `setState` in an effect.
  const probeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    probeRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  return (
    // The v2 `CopilotKitProvider` (not the v1 shim). It needs no `runtimeUrl` because the agent is
    // registered locally, so no runtime-info request and no agent sync are issued.
    <CopilotKitProvider agents__unsafe_dev_only={PROBE_AGENTS}>
      <CopilotChatConfigurationProvider agentId={PROBE_AGENT_ID}>
        <ConciergeCoAgentProvider>
          <RentalFastPathProvider>
            <EventFastPathProvider>
              <RestaurantFastPathProvider>
                <GroundedFastPathProvider>
                  <EventSearchResultsProvider>
                    <EventLocalChatProvider>
                      <SeedButton />
                      <div
                        ref={probeRef}
                        data-testid={testId}
                        data-hydrated="false"
                        // A fixed, explicitly non-zero-height flex parent. CopilotKit warns and
                        // disables virtualization when the scroll container reports
                        // clientHeight === 0, so this height is part of the probe's contract.
                        style={{ height: "600px", display: "flex", minHeight: 0 }}
                      >
                        <ProbeChat messages={messages} />
                      </div>
                    </EventLocalChatProvider>
                  </EventSearchResultsProvider>
                </GroundedFastPathProvider>
              </RestaurantFastPathProvider>
            </EventFastPathProvider>
          </RentalFastPathProvider>
        </ConciergeCoAgentProvider>
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}
