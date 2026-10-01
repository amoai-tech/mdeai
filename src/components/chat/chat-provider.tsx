"use client";

import {
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
} from "@copilotkit/react-core/v2";
import { useState, type ReactNode } from "react";
import { useThreadNav } from "@/lib/chat/thread-nav-context";
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";
import { reportConciergeError } from "@/lib/concierge-error-store";

/**
 * The /chat concierge surface, and the one place its thread is decided.
 *
 * - A saved thread picked in the nav rail is bound as EXPLICIT, so the chat
 *   continues that exact thread.
 * - Otherwise the chat runs on a fresh, NON-explicit thread: new on every visit
 *   to /chat and on every New Chat, so a new conversation never writes into an
 *   old one and does not try to reconnect to a thread that has never run.
 *
 * One `CopilotChatConfigurationProvider` owns that choice for every consumer on
 * the page (chat, map sync, tools), so they cannot drift onto different threads.
 * `useThreadNav` is the single source of truth; nothing here calls the
 * configuration provider's imperative setters.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { activeThreadId, newChatCount } = useThreadNav();

  // React's "adjust state when a prop changes" pattern: a new id the moment
  // New Chat is pressed, with no intermediate render on the old thread.
  const [fresh, setFresh] = useState(() => ({
    newChatCount,
    threadId: crypto.randomUUID(),
  }));
  if (fresh.newChatCount !== newChatCount) {
    setFresh({ newChatCount, threadId: crypto.randomUUID() });
  }

  return (
    <CopilotKitProvider
      {...getCopilotKitClientProps("conciergeAgent")}
      enableInspector={false}
      onError={reportConciergeError}
    >
      <CopilotChatConfigurationProvider
        agentId="conciergeAgent"
        threadId={activeThreadId ?? fresh.threadId}
        hasExplicitThreadId={activeThreadId !== undefined}
      >
        {children}
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}
