"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { MapsStatusProvider } from "@/components/maps/maps-status";
import { useMapsAuthFailure } from "@/components/maps/use-maps-auth-failure";
import { getGoogleMapsApiKey, isE2EMapsMockEnabled } from "@/platform/maps/map-config";

/**
 * Google Maps JS API — map panel only. Pin state lives in MapContextProvider
 * above CopilotSidebar.
 *
 * SAN-1349 · THIS COMPONENT MUST NEVER REPLACE ITS CHILDREN.
 *
 * It previously returned the "map unavailable" panel *instead of* `children`.
 * `geo-chat-shell` wraps the whole concierge — including the CopilotKit
 * composer — in `MapsShell`, so a Google Maps key problem unmounted the chat and
 * took the composer with it. Certification then failed at
 * `expect(copilot-send-button).toBeEnabled()` on a page that no longer had a
 * composer, the deployment-alias check failed, and no production deploy could
 * be promoted.
 *
 * Now the status is published through context and each map slot renders its own
 * fallback, so a broken map degrades only the map. The chat is a text
 * conversation and does not need the Maps JS API to send a message.
 *
 * `APIProvider` is always mounted when a key exists — the guard lives in the map
 * slots, which is what keeps `@vis.gl` hooks from being called without a
 * provider in the no-key case.
 */
export function MapsShell({ children }: { children: React.ReactNode }) {
  const apiKey = getGoogleMapsApiKey();
  const authFailed = useMapsAuthFailure();

  if (isE2EMapsMockEnabled()) {
    return <MapsStatusProvider value="ok">{children}</MapsStatusProvider>;
  }

  // No key: nothing below may call a `@vis.gl` hook, so children receive a
  // "no-key" status and every map slot renders its fallback instead of a <Map>.
  if (!apiKey) {
    return <MapsStatusProvider value="no-key">{children}</MapsStatusProvider>;
  }

  return (
    <MapsStatusProvider value={authFailed ? "auth-failed" : "ok"}>
      <APIProvider apiKey={apiKey} libraries={["marker"]}>
        {children}
      </APIProvider>
    </MapsStatusProvider>
  );
}
