"use client";

import { GeoChatShell } from "@/components/chat/geo-chat-shell";
import { MapContextProvider } from "@/platform/maps/map-context";

export function ChatPageClient() {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-background text-foreground lg:h-dvh lg:min-h-0 lg:overflow-hidden"
    >
      <MapContextProvider>
        <GeoChatShell />
      </MapContextProvider>
    </main>
  );
}
