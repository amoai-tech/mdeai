import { z } from "zod";
import { buildRentalsUrl, type RentalBrowseFilterState } from "@/lib/rentals/browse-filters";
import { isOrderedStay, isRealCalendarDate } from "@/lib/rentals/date-only";

/** Only native rental URL filters may be changed by a page-control action. */
export const rentalPageControlSchema = z.object({
  neighborhood: z.string().trim().min(1).max(80).nullable().optional(),
  beds: z.enum(["0", "1", "2", "3"]).nullable().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict()
  .refine((b) => !b.from || isRealCalendarDate(b.from), { message: "from must be a real date", path: ["from"] })
  .refine((b) => !b.through || isRealCalendarDate(b.through), { message: "through must be a real date", path: ["through"] })
  .refine((b) => isOrderedStay(b.from ?? undefined, b.through ?? undefined), {
    message: "through must not be before from", path: ["through"],
  });

export type RentalPageControlPatch = z.infer<typeof rentalPageControlSchema>;

/** Merge a validated action over the current native filters; undefined keeps, null clears. */
export function applyRentalPageControl(
  current: RentalBrowseFilterState,
  patch: RentalPageControlPatch,
): RentalBrowseFilterState {
  return {
    neighborhood: patch.neighborhood === undefined ? current.neighborhood : patch.neighborhood,
    beds: patch.beds === undefined ? current.beds : patch.beds,
    from: patch.from === undefined ? current.from : patch.from,
    through: patch.through === undefined ? current.through : patch.through,
  };
}

export function buildRentalPageControlUrl(
  current: RentalBrowseFilterState,
  patch: RentalPageControlPatch,
): string {
  return buildRentalsUrl(applyRentalPageControl(current, patch));
}
