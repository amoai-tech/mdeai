"use client";

import { useState } from "react";
import { MapIcon, XIcon } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MapsShell } from "@/components/maps/MapProvider";
import { ChatMap } from "@/components/maps/ChatMap";

export function BrowseMapSheet() {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <Button
        variant="default"
        size="sm"
        className="fixed bottom-6 right-4 z-50 gap-2 shadow-lg"
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
        <SheetContent side="bottom" className="p-0" showCloseButton={false}>
          <SheetClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-3 top-3 z-10 size-11"
                aria-label="Close"
                data-testid="browse-map-close"
              />
            }
          >
            <XIcon aria-hidden />
          </SheetClose>
          <SheetHeader className="sr-only">
            <SheetTitle>Map view</SheetTitle>
          </SheetHeader>
          {/* The sheet's own `data-[side=bottom]:h-auto` beats any height class set on SheetContent, so the
              sheet is only as tall as its content. Google's map sizes itself as 100% of its parent, and a
              percentage of an auto height is 0, which left this map blank on phones. The holder therefore
              owns a definite height (the chat map sheet does the same), and the resize signal redraws the
              map once the sheet has finished sliding in. */}
          <div className="relative h-[70vh] w-full">
            <MapsShell>
              <ChatMap mapDomId="browse-map-sheet" mapResizeSignal={open ? 1 : 0} />
            </MapsShell>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
