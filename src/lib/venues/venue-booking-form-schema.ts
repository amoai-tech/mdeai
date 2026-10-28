import { z } from "zod";

export const venueBookingKindSchema = z.enum([
  "cafe",
  "restaurant",
  "nightclub",
]);

export type VenueBookingKind = z.infer<typeof venueBookingKindSchema>;

export const venueBookingRequestSchema = z.object({
  venueKind: venueBookingKindSchema,
  placeId: z.string().trim().min(8).max(256).nullable().optional(),
  restaurantId: z.string().uuid().nullable().optional(),
  requestedAt: z.string().datetime(),
  partySize: z.coerce.number().int().min(1).max(50),
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email().max(120),
  contactPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  venueTitle: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().trim().min(8).max(64).optional(),
}).superRefine((input, ctx) => {
  if (!input.placeId && !(input.venueKind === "restaurant" && input.restaurantId)) {
    ctx.addIssue({ code: "custom", path: ["placeId"],
      message: "A Google Place ID or an MDE restaurant ID is required." });
  }
  if (input.venueKind !== "restaurant" && input.restaurantId) {
    ctx.addIssue({ code: "custom", path: ["restaurantId"],
      message: "Restaurant IDs are only valid for restaurants." });
  }
});

export type VenueBookingRequestInput = z.infer<typeof venueBookingRequestSchema>;

export type VenueBookingSubmitResult = {
  requestId: string;
  message: string;
};
