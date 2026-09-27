"use client";

import { createContext, useContext } from "react";
import { MapRefererHelp } from "@/components/maps/map-referer-help";
import { useMapsAuthFailure } from "@/components/maps/use-maps-auth-failure";
import { getGoogleMapsApiKey } from "@/platform/maps/map-config";

/**
 * SAN-1349 — why a map cannot render, as one value shared by `MapsShell` and the
 * map slots that live inside it.
 *
 *   "ok"          — key configured and Google accepted it
 *   "no-key"      — NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured
 *   "auth-failed" — Google called `gm_authFailure` (referrer / billing / API off)
 *
 * WHY THIS EXISTS
 * ---------------
 * `MapsShell` used to return the "map unavailable" panel *instead of* its
 * children. `geo-chat-shell` wraps the entire concierge — including the
 * CopilotKit composer — in `MapsShell`, so a Google Maps key problem unmounted
 * the chat. That converted a Maps misconfiguration into a total concierge
 * outage and is what froze production promotion behind certification.
 *
 * The invariant this module restores: **a broken map may only degrade the map.**
 * `MapsShell` now always renders its children and publishes the status here;
 * each map slot renders its own fallback. Nothing outside the map is affected.
 */
export type MapsUnavailableReason = "no-key" | "auth-failed";
export type MapsStatus = "ok" | MapsUnavailableReason;

const MapsStatusContext = createContext<MapsStatus | null>(null);

export function MapsStatusProvider({
  value,
  children,
}: {
  value: MapsStatus;
  children: React.ReactNode;
}) {
  return (
    <MapsStatusContext.Provider value={value}>
      {children}
    </MapsStatusContext.Provider>
  );
}

/**
 * Read the shared status.
 *
 * Falls back to observing the auth-failure flag directly when no provider is
 * mounted, and reports "no-key" when there is no API key — because "ok" is not a
 * safe default: a consumer would render `<Map>` without an `APIProvider`, and
 * `@vis.gl` throws "<Map> can only be used inside an <ApiProvider> component."
 */
export function useMapsStatus(): MapsStatus {
  const fromContext = useContext(MapsStatusContext);
  const failed = useMapsAuthFailure();
  if (fromContext !== null) return fromContext;
  if (!getGoogleMapsApiKey()) return "no-key";
  return failed ? "auth-failed" : "ok";
}

/**
 * The fallback a map slot renders instead of a `<Map>`.
 *
 * IMPORTANT: this is rendered *by the map slot*, never in place of a whole page.
 * Both branches render `<MapRefererHelp />`'s guidance, which is what operators
 * need; the no-key branch keeps the original `map-env-error` test id so existing
 * tests and tooling still find it.
 */
export function MapsUnavailable({
  reason,
  className,
}: {
  reason: MapsUnavailableReason;
  className?: string;
}) {
  if (reason === "no-key") {
    return (
      <div
        data-testid="map-env-error"
        className={
          className ??
          "flex h-full min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        }
      >
        <p>
          Map unavailable: set{" "}
          <code className="text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> and{" "}
          <code className="text-xs">NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID</code> in{" "}
          <code className="text-xs">mdeapp/.env.local</code>.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="map-auth-error"
      className={className ?? "flex min-h-0 flex-1 flex-col"}
    >
      <MapRefererHelp />
    </div>
  );
}
