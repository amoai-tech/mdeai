"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getGoogleMapsApiKey } from "@/platform/maps/map-config";

declare global {
  interface Window {
    __mdeMapsAuthFailed?: boolean;
    gm_authFailure?: () => void;
  }
}

const AUTH_EVENT = "mde-maps-auth-failure";

/** Google Maps calls `window.gm_authFailure` on RefererNotAllowed / key errors. */
export function useMapsAuthFailure(): boolean {
  const [failed, setFailed] = useState(
    () =>
      typeof window !== "undefined" && Boolean(window.__mdeMapsAuthFailed),
  );

  useEffect(() => {
    const onFailure = () => setFailed(true);
    window.addEventListener(AUTH_EVENT, onFailure);
    return () => window.removeEventListener(AUTH_EVENT, onFailure);
  }, []);

  return failed;
}

/**
 * SAN-1349 — why a map cannot render, shared by `MapsShell` and the map slots
 * inside it: "ok", "no-key", or "auth-failed" (Google called `gm_authFailure`).
 *
 * `MapsShell` used to return the "map unavailable" panel *instead of* its
 * children, and `geo-chat-shell` wraps the whole concierge — composer included —
 * in `MapsShell`. So a Maps key problem unmounted the chat, certification failed
 * on a page with no composer, and no production deploy could be promoted.
 *
 * The invariant now: a broken map may only degrade the map. `MapsShell` always
 * renders its children and publishes the status here; each map slot renders
 * `MapsUnavailable` instead of a `<Map>`. `MapsUnavailable` lives in
 * map-referer-help.tsx, next to the UI it reuses.
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
 * Read the shared status. With no provider above us, "ok" is not a safe
 * default: the consumer would render `<Map>` with no `APIProvider` and `@vis.gl`
 * throws "<Map> can only be used inside an <ApiProvider> component."
 */
export function useMapsStatus(): MapsStatus {
  const fromContext = useContext(MapsStatusContext);
  const failed = useMapsAuthFailure();
  if (fromContext !== null) return fromContext;
  if (!getGoogleMapsApiKey()) return "no-key";
  return failed ? "auth-failed" : "ok";
}
