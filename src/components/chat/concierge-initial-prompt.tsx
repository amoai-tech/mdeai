"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { sendConciergeUserMessage } from "@/lib/concierge-send-user-message";
import { useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";

/**
 * Reads /chat?q= from home CTAs, auto-sends once, then strips the query param.
 * No UI — must mount inside GeoChatShell fast-path providers.
 * Waits for the real runtime-synced concierge agent (isReady) before sending.
 */
export function ConciergeInitialPrompt() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isReady } = useConciergeCoAgent();
  const handlers = useConciergeSendHandlers();
  const sentRef = useRef(false);

  useEffect(() => {
    const rawQ = searchParams.get("q");
    const trimmedQ = rawQ?.trim();
    if (rawQ !== null && trimmedQ === "") {
      sentRef.current = true;
      router.replace("/chat", { scroll: false });
      return;
    }
    if (!trimmedQ || sentRef.current || !isReady) return;

    void sendConciergeUserMessage(trimmedQ, handlers).then((handled) => {
      if (!handled) return;

      sentRef.current = true;
      if (typeof window === "undefined") return;
      const onChatWithQ =
        window.location.pathname === "/chat" &&
        new URLSearchParams(window.location.search).has("q");
      if (onChatWithQ) {
        router.replace("/chat", { scroll: false });
      }
    });
  }, [searchParams, isReady, router, handlers]);

  return null;
}
