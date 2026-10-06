"use client";

import { ChatCenterPanel } from "@/components/chat/chat-center-panel";
import { ChatMapPanel } from "@/components/chat/chat-map-panel";
import { ChatNavRail } from "@/components/chat/chat-nav-rail";
import { CafeDetailMobileSheet } from "@/components/chat/cafe-detail-mobile-sheet";
import { NightlifeDetailMobileSheet } from "@/components/chat/nightlife-detail-mobile-sheet";
import { MapMobileSheet } from "@/components/chat/map-mobile-sheet";

/** Mindtrip layout: nav, center chat, right map. */
export function ChatCanvas() {
  return (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[208px_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]"
        data-testid="chat-canvas"
      >
        <aside
          className="hidden min-h-0 overflow-y-auto border-r border-border p-4 lg:flex lg:flex-col"
          aria-label="Left navigation"
        >
          <ChatNavRail />
        </aside>
        <ChatCenterPanel />
        <ChatMapPanel />
      </div>
      <MapMobileSheet />
      <CafeDetailMobileSheet />
      <NightlifeDetailMobileSheet />
    </>
  );
}
