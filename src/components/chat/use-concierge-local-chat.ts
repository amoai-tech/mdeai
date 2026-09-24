"use client";

import { useEventLocalChat } from "@/components/chat/event-local-chat-context";

/**
 * Concierge-wide local chat hook.
 * Re-exports the generic local-chat context (supports rental, event, restaurant).
 * The underlying context is domain-agnostic despite the legacy "Event" prefix.
 */
export function useConciergeLocalChat() {
  return useEventLocalChat();
}
