/**
 * SAN-486 — the /rentals browse filters as URL state, with ONE parser and ONE URL builder.
 *
 * The page, the filter chips, the date form, the cards and the detail page's "Back to results" link
 * all share this, so a renter's neighborhood, bedrooms and stay dates survive a refresh, the Back
 * button and a trip to a listing and back.
 *
 * Dates are `From` (first day) and `Through` (last day, inclusive) as Medellín calendar dates
 * (`YYYY-MM-DD`). Anything that is not a real date, or a Through before the From, is reported as a
 * `dateError`; the page then shows that message and runs NO search, rather than silently ignoring
 * the dates and showing apartments that may not be free (fail closed).
 */
import { isOrderedStay, isRealCalendarDate } from "@/lib/rentals/date-only";

type RawParam = string | string[] | undefined;

export type RentalBrowseSearchParams = {
  neighborhood?: RawParam;
  beds?: RawParam;
  from?: RawParam;
  through?: RawParam;
};

export type RentalBrowseFilterState = {
  neighborhood: string | null;
  beds: string | null;
  from: string | null;
  through: string | null;
};

export const DATE_ERROR_NOT_REAL = "Dates must be real calendar dates, for example 2026-11-01.";
export const DATE_ERROR_REVERSED = "“Through” can’t be before “From”.";

const first = (value: RawParam): string | null => {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
};

export function parseBrowseFilters(params: RentalBrowseSearchParams): {
  filters: RentalBrowseFilterState;
  dateError: string | null;
} {
  const neighborhood = first(params.neighborhood);
  const bedsRaw = first(params.beds);
  const beds = bedsRaw && /^[0-3]$/.test(bedsRaw) ? bedsRaw : null;
  const rawFrom = first(params.from);
  const rawThrough = first(params.through);

  if ((rawFrom && !isRealCalendarDate(rawFrom)) || (rawThrough && !isRealCalendarDate(rawThrough))) {
    return { filters: { neighborhood, beds, from: null, through: null }, dateError: DATE_ERROR_NOT_REAL };
  }
  if (!isOrderedStay(rawFrom ?? undefined, rawThrough ?? undefined)) {
    return { filters: { neighborhood, beds, from: rawFrom, through: rawThrough }, dateError: DATE_ERROR_REVERSED };
  }
  return { filters: { neighborhood, beds, from: rawFrom, through: rawThrough }, dateError: null };
}

/** The query string (with leading `?`, or empty) for the given filters. */
export function rentalsQueryString(filters: Partial<RentalBrowseFilterState>): string {
  const p = new URLSearchParams();
  if (filters.neighborhood) p.set("neighborhood", filters.neighborhood);
  if (filters.beds) p.set("beds", filters.beds);
  if (filters.from) p.set("from", filters.from);
  if (filters.through) p.set("through", filters.through);
  const q = p.toString();
  return q ? `?${q}` : "";
}

export function buildRentalsUrl(filters: Partial<RentalBrowseFilterState>): string {
  return `/rentals${rentalsQueryString(filters)}`;
}
