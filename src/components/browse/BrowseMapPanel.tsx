"use client";

import type { ReactNode } from "react";
import { ChatMap } from "@/components/maps/ChatMap";
import { MapsShell } from "@/components/maps/MapProvider";
import { cn } from "@/lib/utils";

/**
 * Sticky desktop map column. `overlay` (SAN-1416) draws a Details panel over the map instead of
 * replacing it, so the map keeps its camera, pins and selection while the panel is open.
 */
export function BrowseMapPanel({ overlay }: { overlay?: ReactNode }) {
  return (
    <div
      // z-20 only while Details is open: the sticky filter header (z-10) is taller than this
      // column's offset, and would otherwise cover the panel's title and Close button.
      className={cn(
        "sticky top-28 hidden h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-border lg:block",
        overlay && "z-20",
      )}
      data-testid="browse-map-panel"
    >
      {/* inert: while the overlay covers the map, its controls must not take keyboard focus. */}
      <div className="size-full" inert={overlay ? true : undefined}>
        <MapsShell>
          <ChatMap mapDomId="browse-map" />
        </MapsShell>
      </div>
      {overlay}
    </div>
  );
}
