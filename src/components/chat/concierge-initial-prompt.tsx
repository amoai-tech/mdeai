"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";
import { sendConciergeUserMessage } from "@/lib/concierge-send-user-message";
import { useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";
import { useSession } from "@/hooks/use-session";

/**
 * Reads /chat?q= from home CTAs, auto-sends once, then strips the query param.
 * No UI — must mount inside GeoChatShell fast-path providers.
 * Waits for the real runtime-synced concierge agent (isReady) before sending — except for a visitor
 * who is confirmed signed out. The AI runtime refuses guests on purpose (401), so it never becomes
 * ready for them; waiting would leave the question unsent and unacknowledged forever. A confirmed
 * guest goes straight into the shared send pipeline, which answers with a public search or the
 * sign-in offer and never opens an agent run (see `onAgentSend`).
 */
export function ConciergeInitialPrompt() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isReady } = useConciergeCoAgent();
  const { isLoading } = useConciergeChat();
  const handlers = useConciergeSendHandlers();
  const { user, loading: sessionLoading } = useSession();
  // Only a finished session check counts: while it is loading, a signed-in visitor must still wait for isReady.
  const isConfirmedGuest = !sessionLoading && !user;
  const sentRef = useRef(false);

  useEffect(() => {
    const rawQ = searchParams.get("q");
    const trimmedQ = rawQ?.trim();
    if (rawQ !== null && trimmedQ === "") {
      sentRef.current = true;
      router.replace("/chat", { scroll: false });
      return;
    }
    if (!trimmedQ || sentRef.current || sessionLoading || !(isReady || isConfirmedGuest) || isLoading) return;

    // Claim the send before starting to prevent concurrent sends
    sentRef.current = true;

    void sendConciergeUserMessage(trimmedQ, handlers)
      .then((handled) => {
        if (!handled) {
          // Release claim if not handled so a retry can occur
          sentRef.current = false;
          return;
        }

        if (typeof window === "undefined") return;
        const onChatWithQ =
          window.location.pathname === "/chat" &&
          new URLSearchParams(window.location.search).has("q");
        if (onChatWithQ) {
          router.replace("/chat", { scroll: false });
        }
      })
      .catch(() => {
        // Release claim on rejection so a retry can occur
        sentRef.current = false;
      });
  }, [searchParams, isReady, isConfirmedGuest, sessionLoading, isLoading, router, handlers]);

  return null;
}
