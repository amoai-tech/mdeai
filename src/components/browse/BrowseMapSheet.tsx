"use client";

import { useState } from "react";
import { MapIcon, XIcon } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { BrowseMapFallback } from "@/components/browse/browse-map-fallback";
import { AppErrorBoundary } from "@/components/errors/error-boundary";
import { MapsShell } from "@/components/maps/MapProvider";
import { ChatMap } from "@/components/maps/ChatMap";

export function BrowseMapSheet({ raised = false }: { raised?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <Button
        variant="default"
        size="sm"
        // SAN-1421: on a page with a pinned Ask MDE composer, the phone FAB sits above that bar —
        // measured, so an expanded transcript or an error row cannot end up underneath the button.
        className={raised ? "fixed right-4 z-50 gap-2 shadow-lg" : "fixed bottom-6 right-4 z-50 gap-2 shadow-lg"}
        style={raised ? { bottom: "calc(1rem + var(--mde-ask-composer-height, 6rem))" } : undefined}
        onClick={() => setOpen(true)}
        aria-label="Open map"
        data-testid="browse-map-fab"
      >
        <MapIcon className="size-4" aria-hidden />
        Map
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        {/* The default close button is 28px; rentals and restaurants use this shared
            browse map sheet, with a 44px phone target (SAN-524). */}
        {/* pb: keep the sheet's bottom edge clear of the home indicator on notched phones. */}
        <SheetContent
          side="bottom"
          className="gap-0 p-0 pb-[env(safe-area-inset-bottom,0px)]"
          showCloseButton={false}
        >
          {/* Keep our close control in a separate toolbar. On Android, Google's
              fullscreen button occupies the same top-right spot inside the map. */}
          <div
            data-testid="browse-map-toolbar"
            className="flex h-14 shrink-0 items-center justify-between border-b px-3"
          >
            <SheetHeader className="p-0">
              <SheetTitle className="text-sm">Map view</SheetTitle>
            </SheetHeader>
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-11"
                  aria-label="Close"
                  data-testid="browse-map-close"
                />
              }
            >
              <XIcon aria-hidden />
            </SheetClose>
          </div>
          {/* The sheet's own `data-[side=bottom]:h-auto` beats any height class set on SheetContent, so the
              sheet is only as tall as its content. Google's map sizes itself as 100% of its parent, and a
              percentage of an auto height is 0, which left this map blank on phones. The holder therefore
              owns a definite height (the chat map sheet does the same), and the resize signal redraws the
              map once the sheet has finished sliding in. Capped at 520px with a 280px floor, like the chat
              map sheet; `vh` rather than `dvh` so an older browser cannot drop the declaration and blank
              the map again. */}
          <AppErrorBoundary fallback={<BrowseMapFallback />} label="browse-map-sheet">
            <div className="relative h-[min(70vh,520px)] min-h-[280px] w-full">
              <MapsShell>
                <ChatMap mapDomId="browse-map-sheet" mapResizeSignal={open ? 1 : 0} />
              </MapsShell>
            </div>
          </AppErrorBoundary>
        </SheetContent>
      </Sheet>
    </div>
  );
}
