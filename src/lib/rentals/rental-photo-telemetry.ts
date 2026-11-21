import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";

/** Report image-host outages to server logs, without exposing photo URLs or renter data. */
const lastReportedByHost = new Map<string, number>();
const REPORT_WINDOW_MS = 60_000;

export function reportRentalPhotoFailure(url: string): void {
  if (!isRenderableRemoteImage(url)) return;
  const host = new URL(url).hostname;
  const now = Date.now();
  if (now - (lastReportedByHost.get(host) ?? -Infinity) < REPORT_WINDOW_MS) return;
  lastReportedByHost.set(host, now);
  // Best effort: telemetry must never block browsing or throw from an image handler.
  try {
    void fetch("/api/rentals/photo-failures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Browsers that disallow this request still show the normal photo fallback.
  }
}

export function resetRentalPhotoTelemetryForTests(): void {
  lastReportedByHost.clear();
}
