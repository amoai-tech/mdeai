import { venueBookingRequestSchema } from "@/lib/venues/venue-booking-form-schema";
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
  return parsed.success ? parsed.data : null;
}
