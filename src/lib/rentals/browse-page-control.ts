import { z } from "zod";
import { buildRentalsUrl, type RentalBrowseFilterState } from "@/lib/rentals/browse-filters";
import { isOrderedStay, isRealCalendarDate } from "@/lib/rentals/date-only";
import { buildRentalSearchParams, scoreRentalQuery } from "@/lib/rental-query-parser";

/** Only native rental URL filters may be changed by a page-control action. */
export const rentalPageControlSchema = z.object({
  neighborhood: z.string().trim().min(1).max(80).nullable().optional(),
  beds: z.enum(["0", "1", "2", "3"]).nullable().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict()
  .refine((b) => !b.from || isRealCalendarDate(b.from), { message: "from must be a real date", path: ["from"] })
  .refine((b) => !b.through || isRealCalendarDate(b.through), { message: "through must be a real date", path: ["through"] });

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

/**
 * Deterministic fast path for explicit page commands such as "on this page, show
 * only 1-bedroom apartments in Laureles". It only handles native URL filters;
 * anything with an unsupported criterion stays on the existing search/agent path.
 */
export function parseRentalPageCommand(text: string): RentalPageControlPatch | null {
  if (!/\bon (this|the) page\b|\bchange the page\b|\bpage filters?\b|\bset the (visible )?filters?\b/i.test(text)) {
    return null;
  }
  if (/\b(remove|clear|without|not|don't|do not|exclude|any|all|furnished|balcony|pets?|parking|pool|gym|wifi|internet|workspace|desk|quiet|caf[eé]s?|metro|family|terrace|overlooking|nomad|remote|near|top|budget|under|below|less than)\b/i.test(text)) {
    return null;
  }
  const signals = scoreRentalQuery(text);
  if (signals.hasVibeOrUseCase || signals.hasNomad || signals.hasCafeOrGym) return null;
  const parsed = buildRentalSearchParams(text, {});
  if (!parsed) return null;
  // The page can only apply these native filters. If the question carries a
  // budget, stay type, broad query text or a bedroom range, send it to the
  // existing search/agent path rather than dropping part of the request.
  if (parsed.maxPricePerNight != null || parsed.maxPriceMonthly != null ||
      parsed.stayType != null) return null;
  if (parsed.minBedrooms != null && (parsed.minBedrooms < 0 || parsed.minBedrooms > 3)) return null;
  if (parsed.maxBedrooms != null && parsed.maxBedrooms !== parsed.minBedrooms) return null;
  const patch: RentalPageControlPatch = {};
  if (parsed.neighborhood) patch.neighborhood = parsed.neighborhood;
  if (parsed.minBedrooms != null) patch.beds = String(parsed.minBedrooms) as "0" | "1" | "2" | "3";
  if (parsed.checkIn) patch.from = parsed.checkIn;
  if (parsed.checkOut) patch.through = parsed.checkOut;
  return Object.keys(patch).length > 0 ? patch : null;
}

export type RentalPageControlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Validate both the patch and the final current+patch state before navigation. */
export function resolveRentalPageControl(
  current: RentalBrowseFilterState,
  rawPatch: unknown,
): RentalPageControlResult {
  const parsed = rentalPageControlSchema.safeParse(rawPatch);
  if (!parsed.success) {
    return { ok: false, error: "Unsupported or invalid rental page filter." };
  }
  const merged = applyRentalPageControl(current, parsed.data);
  if (!isOrderedStay(merged.from ?? undefined, merged.through ?? undefined)) {
    return { ok: false, error: "The stay dates would be reversed; no page filter was changed." };
  }
  return { ok: true, url: buildRentalsUrl(merged) };
}

export function buildRentalPageControlUrl(
  current: RentalBrowseFilterState,
  patch: RentalPageControlPatch,
): string {
  const result = resolveRentalPageControl(current, patch);
  return result.ok ? result.url : buildRentalsUrl(current);
}
