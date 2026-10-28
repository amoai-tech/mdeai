import { venueBookingRequestSchema } from "@/lib/venues/venue-booking-form-schema";
import type { VenueBookingHitlArgs } from "./venue-booking-hitl-panel";

const KEY = "mde.venue-booking.review";
const TTL = 30 * 60 * 1000;

export function saveVenueBookingReview(args: VenueBookingHitlArgs): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify({ args, savedAt: Date.now() }));
}

export function restoreVenueBookingReview(): VenueBookingHitlArgs | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as { args: unknown; savedAt: number };
    if (!Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > TTL) {
      clearVenueBookingReview();
      return null;
    }
    const parsed = venueBookingRequestSchema.safeParse(saved.args);
    if (!parsed.success) {
      clearVenueBookingReview();
      return null;
    }
    return parsed.data;
  } catch {
    clearVenueBookingReview();
    return null;
  }
}

export function clearVenueBookingReview(): void {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(KEY);
}
