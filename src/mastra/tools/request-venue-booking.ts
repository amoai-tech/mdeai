import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  venueBookingKindSchema,
  venueBookingRequestSchema,
} from "@/lib/venues/venue-booking-form-schema";
import { getAuditUserId } from "@/mastra/lib/tool-audit-context";
import { withAudit } from "@/mastra/tools/audit-wrapper";
import { RiskLevel } from "@/mastra/tools/risk-levels";

const requestVenueBookingInputSchema = venueBookingRequestSchema;

const requestVenueBookingOutputSchema = z.object({
  success: z.boolean(),
  requestId: z.string().uuid().optional(),
  message: z.string(),
});

export type RequestVenueBookingInput = z.infer<
  typeof requestVenueBookingInputSchema
>;
export type RequestVenueBookingOutput = z.infer<
  typeof requestVenueBookingOutputSchema
>;

type AuditedVenueBookingInput = {
  booking: RequestVenueBookingInput;
  userId: string | null;
};

const executeRequestVenueBooking = withAudit(
  "request-venue-booking",
  RiskLevel.medium,
  async ({
    userId,
  }: AuditedVenueBookingInput): Promise<RequestVenueBookingOutput> => {
    if (!userId) {
      return {
        success: false,
        message: "Sign in to request a booking.",
      };
    }

    // An AI tool call is NOT customer consent. Never perform the side effect
    // here: the existing CopilotKit approval UI collects the user's decision,
    // then submits through the authenticated POST /api/venue-booking/request.
    // This also prevents headless/forged agent calls from booking anything.
    return {
      success: false,
      message: "Booking proposal prepared. Ask the customer to review and send the request; no request has been saved yet.",
    };
  },
);

export const requestVenueBookingTool = createTool({
  id: "request-venue-booking",
  description:
    "Propose a table, café, or nightlife booking request for explicit customer review in the HITL card. Requires venueKind, requestedAt (ISO datetime), partySize and contact fields; restaurant requests accept a canonical restaurantId without placeId, while external places need a placeId. This tool never saves a booking; only the customer-confirmed UI calls the authenticated booking API.",
  inputSchema: requestVenueBookingInputSchema,
  outputSchema: requestVenueBookingOutputSchema,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (inputData: RequestVenueBookingInput, context?: any) => {
    const parsed = requestVenueBookingInputSchema.safeParse(inputData);
    if (!parsed.success) {
      return {
        success: false,
        message: "Validation failed — check venue, date, party size, and contact fields.",
      };
    }

    const userId = getAuditUserId(context);
    return executeRequestVenueBooking(
      { booking: parsed.data, userId },
      { user_id: userId },
    );
  },
});

/** Re-export for agent prompts and tests. */
export { venueBookingKindSchema };
