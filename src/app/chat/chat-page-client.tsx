"use client";

import { GeoChatShell } from "@/components/chat/geo-chat-shell";
import { useChatKeyboardHeight } from "@/lib/hooks/use-chat-keyboard-height";
import { MapContextProvider } from "@/platform/maps/map-context";

export function ChatPageClient() {
  useChatKeyboardHeight();

  return (
    <main
      id="main-content"
      className="mde-chat-viewport min-h-0 overflow-hidden bg-background text-foreground"
    >
      <MapContextProvider>
        <GeoChatShell />
      </MapContextProvider>
    </main>
  );
}
