import { venueBookingRequestSchema } from "@/lib/venues/venue-booking-form-schema";
import { z } from "zod";
import type { VenueBookingHitlArgs } from "./venue-booking-hitl-panel";

/** CopilotKit's inProgress arguments are an unfinished stream. Only present
 * human controls once the framework has completed the tool-call arguments.
 * Validation independently requires all booking fields before review.
 */
export function readyVenueBookingHitlArgs(
  args: Partial<VenueBookingHitlArgs>,
  status: "inProgress" | "executing" | "complete",
): VenueBookingHitlArgs | null {
  if (status === "inProgress") return null;
  const parsed = venueBookingRequestSchema.safeParse(args);
  if (!parsed.success) return null;
  const data = parsed.data;
  // Some model providers put MDE's canonical restaurant UUID in `placeId`.
  // It is not a Google Place ID. Treat it as a candidate restaurant identifier;
  // the regular RLS-scoped lookup and booking API still validate it against DB.
  if (data.venueKind === "restaurant" && !data.restaurantId && data.placeId &&
      z.string().uuid().safeParse(data.placeId).success) {
    return { ...data, restaurantId: data.placeId, placeId: undefined, venueTitle: undefined };
  }
  return data;
}
