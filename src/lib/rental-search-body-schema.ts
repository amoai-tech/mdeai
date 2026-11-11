/** One canonical runtime validator for the rental API and saved-thread search criteria. */
import { z } from "zod";
import { isOrderedStay, isRealCalendarDate } from "@/lib/rentals/date-only";

/** A monthly cap is meaningful only when its currency is explicitly known. */
export const monthlyBudgetHasCurrency = (query: { maxPriceMonthly?: number; budgetCurrency?: string }) =>
  query.maxPriceMonthly === undefined || query.budgetCurrency !== undefined;

export const MONTHLY_CURRENCY_REQUIRED = "budgetCurrency is required when maxPriceMonthly is supplied";

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
}).refine(monthlyBudgetHasCurrency, {
  message: MONTHLY_CURRENCY_REQUIRED,
  path: ["budgetCurrency"],
}).refine((b) => b.minBedrooms === undefined || b.maxBedrooms === undefined || b.minBedrooms <= b.maxBedrooms, {
  message: "maxBedrooms must be greater than or equal to minBedrooms",
  path: ["maxBedrooms"],
}).refine((b) => isOrderedStay(b.checkIn, b.checkOut), {
  message: "checkOut must not be before checkIn",
  path: ["checkOut"],
});
