"use client";

import { notFound } from "next/navigation";
import { ConciergeProbe } from "@/app/dev/_probe/concierge-probe";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";

/**
 * SAN-966 probe: the real CopilotKit chat view with an EMPTY thread.
 *
 * CopilotKit shows its welcome screen, and never mounts the message list, while the thread has no
 * messages. Fast-path results and shortcut messages live in that message list, so this page proves
 * they are still shown when the thread is empty (for example while the AI runtime is down) and
 * that the welcome screen still appears when there is nothing to show.
 *
 * Gated to non-production deterministic E2E only.
 */
export default function ChatEmptyThreadProbePage() {
  if (!isDeterministicE2E()) notFound();
  return <ConciergeProbe messages={[]} testId="empty-thread-probe" />;
}
