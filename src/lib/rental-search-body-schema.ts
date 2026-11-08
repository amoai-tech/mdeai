/** One canonical runtime validator for the rental API and saved-thread search criteria. */
import { z } from "zod";
import { isOrderedStay, isRealCalendarDate } from "@/lib/rentals/date-only";

export const rentalSearchBodySchema = z.object({
  neighborhood: z.string().optional(),
  minBedrooms: z.number().int().min(0).optional(),
  maxBedrooms: z.number().int().min(0).optional(),
  maxPricePerNight: z.number().positive().optional(),
  maxPriceMonthly: z.number().positive().safe().optional(),
  budgetCurrency: z.enum(["COP", "USD"]).optional(),
  limit: z.number().int().min(1).max(20).optional().default(8),
  queryText: z.string().optional(),
  checkIn: z.string().refine(isRealCalendarDate, "checkIn must be a real date, YYYY-MM-DD").optional(),
  checkOut: z.string().refine(isRealCalendarDate, "checkOut must be a real date, YYYY-MM-DD").optional(),
  stayType: z.enum(["nightly", "monthly", "total_trip"]).optional(),
}).refine((b) => b.minBedrooms === undefined || b.maxBedrooms === undefined || b.minBedrooms <= b.maxBedrooms, {
  message: "maxBedrooms must be greater than or equal to minBedrooms",
  path: ["maxBedrooms"],
}).refine((b) => isOrderedStay(b.checkIn, b.checkOut), {
  message: "checkOut must not be before checkIn",
  path: ["checkOut"],
});
