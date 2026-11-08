import { z } from "zod";
import { buildRentalsUrl, type RentalBrowseFilterState } from "@/lib/rentals/browse-filters";
import { isOrderedStay, isRealCalendarDate } from "@/lib/rentals/date-only";
import { buildRentalSearchParams, scoreRentalQuery, MAX_RENTAL_TEXT_CHARS } from "@/lib/rental-query-parser";

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
 * A native URL command is safe only when every word describes a known page
 * control. Everything else belongs to the richer rental search/agent path.
 */
const NATIVE_PAGE_COMMAND_WORDS = new Set([
  "on", "this", "the", "page", "filter", "filters", "visible", "set", "change", "to",
  "show", "only", "me", "please", "find", "display", "get", "for", "in", "at",
  "from", "through", "and", "of", "a", "an", "are", "be", "as",
  "apartment", "apartments", "rental", "rentals", "listing", "listings", "home", "homes",
  "unit", "units", "stay", "stays", "bed", "beds", "br", "bedroom", "bedrooms",
  "one", "two", "three", "studio", "studios",
  "laureles", "laureless", "envigado", "poblado", "provenza", "el", "belén", "belen", "estadio",
  "weekend", "tomorrow", "jan", "january", "feb", "february", "mar", "march",
  "apr", "april", "may", "jun", "june", "jul", "july", "aug", "august",
  "sep", "september", "oct", "october", "nov", "november", "dec", "december",
]);

/**
 * Deterministic fast path for positive, fully supported page commands.
 * Negative, semantic and unknown qualifiers must never be silently discarded.
 */
export function parseRentalPageCommand(text: string): RentalPageControlPatch | null {
  if (text.length > MAX_RENTAL_TEXT_CHARS ||
      !/\bon (this|the) page\b|\bpage filters?\b|\bset the (visible )?filters?\b|\bchange (?:the|this) page to\b/i.test(text)) {
    return null;
  }
  if (/\b(remove|clear|without|exclude|except|not|no|any|all|neither|instead|omit)\b|\bdon['’]?t\b/i.test(text)) {
    return null;
  }
  const signals = scoreRentalQuery(text);
  if (signals.hasBudget || signals.hasVibeOrUseCase || signals.hasNomad ||
      signals.hasCafeOrGym || signals.cityWide || signals.explicitLimit != null) return null;

  // The canonical broad parser can attach queryText to even a valid 1BR
  // Laureles command. Validate the original words, not just queryText.
  // Unknown words such as "near metro" / "terrace" defer the ENTIRE request.
  const words = text.toLowerCase().match(/[a-z0-9áéíóúñ]+/g) ?? [];
  if (!words.every((word) => NATIVE_PAGE_COMMAND_WORDS.has(word) || /^\d+(?:br|beds?|bedrooms?)?$/.test(word))) {
    return null;
  }

  const parsed = buildRentalSearchParams(text, {});
  if (!parsed) return null;
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
