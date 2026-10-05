"use client";

import { notFound } from "next/navigation";
import { ConciergeProbe } from "@/app/dev/_probe/concierge-probe";
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
 *   - `DeterministicConciergeChat` — it bypasses CopilotKit and renders no transcript (only
 *     the local results tail), so it cannot say anything about the real message list.
 *   - the app's `getCopilotKitClientProps("conciergeAgent")` provider, because pointing
 *     the probe at a real runtime makes `useAgent` throw when `/info` advertises no
 *     agents. That uncaught error aborts the client render, so the page never hydrates
 *     and every virtualization measurement silently reads server-rendered HTML instead.
 *   - a `children` render prop on the message view — that silently disables
 *     virtualization, which is the exact failure this probe is looking for.
 *
 * SAN-966: the shared probe renders the app's own `messageView` (the stock list plus the results
 * tail), so this same 500-message proof also shows the wrapper keeps the stock list virtualized
 * (see chat-virtualization.spec.ts, which asserts the `[data-index]` row counts).
 *
 * Gated to non-production deterministic E2E only, so it can never reach a real user.
 */

const MESSAGE_COUNT = 500;

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
  return <ConciergeProbe messages={makeProbeMessages()} testId="virtualization-probe" />;
}
