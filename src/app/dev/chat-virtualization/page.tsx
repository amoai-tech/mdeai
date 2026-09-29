"use client";

import { useEffect, useRef } from "react";
import { notFound } from "next/navigation";
import {
  CopilotChatConfigurationProvider,
  CopilotChatView,
  CopilotKitProvider,
  HttpAgent,
} from "@copilotkit/react-core/v2";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";

/**
 * SAN-1357 virtualization probe — the smallest thing that can answer one question:
 *
 *   Does the REAL CopilotKit 1.75.0 `CopilotChatView` virtualize a 500-message
 *   conversation when it is handed `messages` directly, with no transport at all?
 *
 * Why this exists: `CopilotChatViewProps` declares `messages?: Message[]` as a direct
 * prop (verified in the installed 1.75.0 types), and `shouldVirtualize` in
 * `CopilotChatMessageView` needs only three things — a non-zero-height scroll element
 * from `CopilotChatView.ScrollView`, no `children` render prop, and >50 rendered
 * messages. All three are reachable without a live runtime, so before building an
 * SSE + AG-UI mock we measure whether the mock is needed at all.
 *
 * Deliberately NOT used here:
 *   - `DeterministicConciergeChat` — it bypasses CopilotKit and renders no messages.
 *   - the app's `getCopilotKitClientProps("conciergeAgent")` provider, because pointing
 *     the probe at a real runtime makes `useAgent` throw when `/info` advertises no
 *     agents. That uncaught error aborts the client render, so the page never hydrates
 *     and every virtualization measurement silently reads server-rendered HTML instead.
 *   - a `children` render prop on the message view — that silently disables
 *     virtualization, which is the exact failure this probe is looking for.
 *
 * Gated to non-production deterministic E2E only, so it can never reach a real user.
 */

const MESSAGE_COUNT = 500;
const PROBE_AGENT_ID = "conciergeAgent";

/**
 * `useAgent` throws unless the requested agent is registered or a runtime sync is in a
 * pending/error state — installed react-core v2, dist
 * `copilotkit-CoWG8EAX.mjs:4605-4607`. The probe never starts a run, so the agent only
 * has to *exist*; registering it locally via `agents__unsafe_dev_only` is the dev-only
 * escape hatch that the library's own error message points to. The URL is deliberately
 * unreachable so that any accidental transport fails loudly instead of passing quietly.
 */
const PROBE_AGENTS = {
  [PROBE_AGENT_ID]: new HttpAgent({ url: "http://127.0.0.1:1/probe-agent-never-runs" }),
};

/**
 * Valid AG-UI messages (`z.infer<typeof MessageSchema>`, discriminated on `role`).
 * Ids are stable so the view's dedupe path treats them as 500 distinct messages.
 */
function makeProbeMessages() {
  return Array.from({ length: MESSAGE_COUNT }, (_, index) => ({
    id: `probe-${index}`,
    role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `Probe message ${index + 1} of ${MESSAGE_COUNT}`,
  }));
}

export default function ChatVirtualizationProbePage() {
  // Never render outside deterministic E2E, and never in production.
  if (!isDeterministicE2E()) notFound();

  // Hydration proof. CopilotKit's `ScrollView` only provides `ScrollElementContext` from
  // its own mount effect, so an un-hydrated page can only ever show the server-rendered
  // pre-mount branch — where virtualization silently stays off. This flag is set from an
  // effect for exactly that reason: if this effect ran, `ScrollView`'s did too. The spec
  // waits on the marker before measuring, so a broken client render can never be mistaken
  // for a virtualization result. (A DOM attribute rather than state: state would mean a
  // `setState` in an effect, which the repo's lint rules reject.)
  const probeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    probeRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  const messages = makeProbeMessages();

  return (
    <div
      ref={probeRef}
      data-testid="virtualization-probe"
      data-hydrated="false"
      // A fixed, explicitly non-zero-height flex parent. CopilotKit warns and disables
      // virtualization when the scroll container reports clientHeight === 0, so the
      // height here is part of the probe's contract, not decoration.
      style={{ height: "600px", display: "flex", minHeight: 0 }}
    >
      {/*
        `CopilotChatView` calls `useCopilotKit`, so a CopilotKit provider is required for
        CONTEXT alone. This is the v2 `CopilotKitProvider` rather than the v1-compat
        `<CopilotKit>` shim, and it needs no `runtimeUrl` because the agent is registered
        locally — so no runtime info request and no agent sync are issued at all.
      */}
      <CopilotKitProvider agents__unsafe_dev_only={PROBE_AGENTS}>
        <CopilotChatConfigurationProvider agentId={PROBE_AGENT_ID}>
          {/*
            `className` must make the view FILL the 600px parent. Measured: without it the
            message list mounts but reports `hidden`, because the view's own root does not
            stretch and collapses to zero height — which is exactly the condition that
            disables virtualization.
          */}
          <CopilotChatView messages={messages} className="h-full min-h-0 w-full" />
        </CopilotChatConfigurationProvider>
      </CopilotKitProvider>
    </div>
  );
}
