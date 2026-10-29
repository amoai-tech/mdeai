"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Map, MapPin, XIcon } from "lucide-react";
import { ChatMap } from "@/components/maps/ChatMap";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMapsStatus } from "@/components/maps/use-maps-auth-failure";
import { useMapContext } from "@/platform/maps/map-context";

function MapSheetBody({ open }: { open: boolean }) {
  const { pins } = useMapContext();
  const mapsStatus = useMapsStatus();
  const visiblePins = pins.filter((pin) => pin.source !== "mock");
  const showEmpty = visiblePins.length === 0 && mapsStatus !== "auth-failed";

  return (
    <div className="relative h-[min(70vh,520px)] min-h-[280px] w-full">
      <ChatMap mapResizeSignal={open ? 1 : 0} />
      {showEmpty ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 p-4"
          data-testid="map-mobile-empty-state"
        >
          <EmptyState
            testId="map-mobile-empty-card"
            title="Map is ready"
            description="Search in chat to see available map locations."
            icon={<MapPin className="size-6" />}
            className="pointer-events-auto max-w-xs bg-background/95"
          />
        </div>
      ) : null}
    </div>
  );
}

function subscribeLgUp(onChange: () => void) {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getLgUpSnapshot() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

function getLgUpServerSnapshot() {
  return false;
}

const subscribeHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

/** MAP-007 mobile bottom sheet — map without covering chat input. */
export function MapMobileSheet() {
  const [userMapOpen, setUserMapOpen] = useState(false);
  // The trigger is server-rendered before React attaches its click handler.
  // Keep it visibly disabled until hydration so an early tap cannot do nothing.
  const isHydrated = useSyncExternalStore(
    subscribeHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
  const isLgUp = useSyncExternalStore(
    subscribeLgUp,
    getLgUpSnapshot,
    getLgUpServerSnapshot,
  );
  const { pins } = useMapContext();
  const pinCount = pins.filter((p) => p.source !== "mock").length;

  // Forget "open map" intent when crossing to lg so the sheet doesn't auto-reopen on return to mobile.
  const [wasLgUp, setWasLgUp] = useState(isLgUp);
  if (isLgUp !== wasLgUp) {
    setWasLgUp(isLgUp);
    if (isLgUp && userMapOpen) setUserMapOpen(false);
  }

  const sheetOpen = !isLgUp && userMapOpen;

  // SAN-1606 — the tab bar took over the bottom of the screen, so a fixed 7.5rem offset no longer
  // clears both the compact composer and the bar. Measure the composer card itself and keep this
  // control just above it: the composer already sits above the bar, and a longer draft moves the
  // card, so the trigger follows instead of overlapping.
  const [composerGap, setComposerGap] = useState<number | null>(null);
  useEffect(() => {
    if (isLgUp) return;
    const composerSelector = '[data-testid="copilot-chat-input"]';
    const composer = () => document.querySelector<HTMLElement>(composerSelector);
    let observer: ResizeObserver | null = null;
    let observed: HTMLElement | null = null;
    let frame = 0;
    let watchFrame = 0;
    let frames = 0;
    let stable = 0;
    let last = Number.NaN;

    const measure = (): number | null => {
      const element = composer();
      if (!element) return null;
      const gap = Math.round(window.innerHeight - element.getBoundingClientRect().top + 8);
      if (gap > 0) setComposerGap(gap);
      return gap > 0 ? gap : null;
    };

    // Re-attach whenever the composer is a *different node*: switching thread remounts the keyed
    // chat subtree, and an observer left on the detached element would stop reporting growth, so
    // the trigger could end up under an expanded draft.
    const attachObserver = () => {
      if (typeof ResizeObserver === "undefined") return;
      const element = composer();
      if (!element || element === observed) return;
      observer?.disconnect();
      observer = new ResizeObserver(() => measure());
      observer.observe(element);
      observed = element;
      measure();
    };

    // CopilotKit mounts the composer after the runtime resolves, and the welcome screen is still
    // moving while it does: a ResizeObserver only reports size changes and would miss both, so
    // settle on animation frames until the measured gap stops moving, then observe real resizes
    // (a longer draft grows the card) instead of polling forever.
    const settle = () => {
      const gap = measure();
      if (gap != null && gap === last) stable += 1;
      else stable = 0;
      last = gap ?? Number.NaN;
      frames += 1;
      if (stable < 3 && frames < 180) {
        frame = requestAnimationFrame(settle);
      } else {
        attachObserver();
      }
    };
    const startSettle = () => {
      cancelAnimationFrame(frame);
      frames = 0;
      stable = 0;
      last = Number.NaN;
      frame = requestAnimationFrame(settle);
    };

    // One persistent watcher, throttled to a frame: it starts measuring when the composer first
    // appears and after each remount. Watching the chat region (not all of `body`) keeps streaming
    // mutations cheap; the callback only compares node identity.
    const container =
      document.querySelector('[data-testid="copilot-chat-region"]') ?? document.body;
    const watcher = new MutationObserver(() => {
      if (watchFrame) return;
      watchFrame = requestAnimationFrame(() => {
        watchFrame = 0;
        const current = composer();
        if (!current || current === observed) return;
        startSettle();
      });
    });
    watcher.observe(container, { childList: true, subtree: true });
    startSettle();

    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(watchFrame);
      watcher.disconnect();
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isLgUp]);

  return (
    <div
      data-testid="map-mobile-controls"
      data-right-column-mode="map"
      // Pre-measurement (server render, or before the composer mounts) it sits directly above the
      // bar, under the composer: that can cover part of the disclaimer but never the input, the
      // Send control or the bar. The measured position then moves it above the composer.
      className="pointer-events-none fixed bottom-[calc(var(--mde-mobile-nav-clearance)+0.5rem)] right-4 z-40 lg:hidden"
      // `--mde-keyboard-height` (published by useChatKeyboardHeight on /chat) is the overlay
      // keyboard's lift; the composer moves up by it without resizing, so the trigger adds it too.
      style={
        composerGap == null
          ? undefined
          : { bottom: `calc(${composerGap}px + var(--mde-keyboard-height, 0px))` }
      }
    >
      <Button
        type="button"
        data-testid="map-sheet-trigger"
        data-hydrated={isHydrated ? "true" : "false"}
        disabled={!isHydrated}
        className="pointer-events-auto h-11 gap-2 rounded-full px-4 shadow-lg"
        size="default"
        aria-label={pinCount > 0 ? `Open map with ${pinCount} pins` : "Open map"}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-controls="map-sheet-content"
        onClick={() => setUserMapOpen(true)}
      >
        <Map className="size-4" aria-hidden />
        Open map
        {pinCount > 0 ? ` (${pinCount})` : ""}
      </Button>
      <Sheet open={sheetOpen} onOpenChange={setUserMapOpen}>
        <SheetContent
          id="map-sheet-content"
          side="bottom"
          className="flex max-h-[calc(85dvh-env(safe-area-inset-bottom,0px))] min-h-[75dvh] flex-col p-0 pb-[env(safe-area-inset-bottom,0px)]"
          data-testid="map-sheet-content"
          showCloseButton={false}
          onKeyDownCapture={(event) => {
            if (
              event.key !== "Escape" ||
              event.nativeEvent.isComposing ||
              !(event.target instanceof Element) ||
              !event.target.closest('[data-testid="chat-map"]')
            ) {
              return;
            }
            setUserMapOpen(false);
          }}
        >
          <SheetClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-3 top-3 z-10 size-11"
                aria-label="Close"
              />
            }
          >
            <XIcon aria-hidden />
            <span className="sr-only">Close</span>
          </SheetClose>
          <SheetHeader className="border-b border-border px-4 py-3 pr-16 text-left">
            <SheetTitle>Map</SheetTitle>
            <SheetDescription>
              Tap a pin or close to return to chat. Escape closes this sheet.
            </SheetDescription>
          </SheetHeader>
          <MapSheetBody open={sheetOpen} />
        </SheetContent>
      </Sheet>
    </div>
  );
}