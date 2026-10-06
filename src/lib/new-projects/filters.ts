import type { NewProjectFilters, NewProjectSummary } from "./types";

/** Pilot neighborhoods. Matching is exact (case-insensitive) so a typo never broadens results. */
export const NEIGHBORHOOD_OPTIONS = ["Laureles", "Ciudad del Río", "El Poblado"] as const;

export const BED_OPTIONS = [
  { value: "1", label: "1+ BR" },
  { value: "2", label: "2+ BR" },
  { value: "3", label: "3+ BR" },
] as const;

export const MAX_PRICE_OPTIONS = [
  { value: "400000000", label: "≤ COP 400M" },
  { value: "600000000", label: "≤ COP 600M" },
  { value: "900000000", label: "≤ COP 900M" },
  { value: "2000000000", label: "≤ COP 2,000M" },
] as const;

export const DELIVERY_OPTIONS = [
  { value: "2027", label: "Delivery 2027" },
  { value: "2028", label: "Delivery 2028" },
  { value: "2029", label: "Delivery 2029" },
  { value: "unknown", label: "Delivery not published" },
] as const;

export interface ProjectSearchParams {
  neighborhood?: string;
  maxPrice?: string;
  beds?: string;
  delivery?: string;
}

function normalizeNeighborhood(value: string | undefined): string | null {
  if (!value) return null;
  const wanted = value.trim().toLowerCase();
  return NEIGHBORHOOD_OPTIONS.find((n) => n.toLowerCase() === wanted) ?? null;
}

/** Unknown or malformed query values are ignored, never coerced into a filter. */
export function parseProjectFilters(searchParams: ProjectSearchParams): NewProjectFilters {
  const maxPrice =
    searchParams.maxPrice && /^[0-9]{1,12}$/.test(searchParams.maxPrice)
      ? Number(searchParams.maxPrice)
      : null;
  const beds =
    searchParams.beds && /^[1-5]$/.test(searchParams.beds) ? Number(searchParams.beds) : null;
  const deliveryYear =
    searchParams.delivery && /^20[0-9]{2}$/.test(searchParams.delivery)
      ? Number(searchParams.delivery)
      : null;
  return {
    neighborhood: normalizeNeighborhood(searchParams.neighborhood),
    maxPriceCop: maxPrice,
    minBedrooms: beds,
    bedroomsExact: null,
    deliveryYear,
    deliveryUnknown: searchParams.delivery === "unknown",
  };
}

/**
 * Hard, deterministic filters. A project missing a fact is excluded when that fact is
 * filtered on — an unknown price is not "affordable", an unknown delivery year is not 2027.
 *
 * Bedrooms are matched against real typology options, not the project's maximum:
 *   - `minBedrooms` means "2+ bedrooms" (any typology with that many or more);
 *   - `bedroomsExact` means "exactly 2 bedrooms" (a typology with that count).
 *
 * Precedence: if BOTH bedroom filters are set, bedroomsExact wins. The HTTP input schema rejects
 * that combination (superRefine), so this is a defensive rule for direct callers, not a supported
 * input; a unit test locks the behaviour so it cannot drift.
 *
 * When a **budget and a bedroom filter are combined**, a single typology must satisfy BOTH. A
 * typology with no published price fails closed, so "2BR under 600M" never returns a project
 * whose only 2BR has an unknown price.
 */
export function projectMatchesFilters(
  project: NewProjectSummary,
  filters: NewProjectFilters,
): boolean {
  if (filters.neighborhood) {
    if ((project.neighborhood ?? "").toLowerCase() !== filters.neighborhood.toLowerCase()) {
      return false;
    }
  }

  const maxPriceCents = filters.maxPriceCop != null ? filters.maxPriceCop * 100 : null;
  const exact = filters.bedroomsExact;
  const min = filters.minBedrooms;

  if (exact != null && maxPriceCents != null) {
    const match = project.bedroomOptions.some(
      (option) =>
        option.bedrooms === exact &&
        option.priceFromCents != null &&
        option.priceFromCents <= maxPriceCents,
    );
    if (!match) return false;
  } else if (min != null && maxPriceCents != null) {
    const match = project.bedroomOptions.some(
      (option) =>
        option.bedrooms >= min &&
        option.priceFromCents != null &&
        option.priceFromCents <= maxPriceCents,
    );
    if (!match) return false;
  } else if (exact != null) {
    if (!project.bedroomOptions.some((option) => option.bedrooms === exact)) return false;
  } else if (min != null) {
    if (!project.bedroomOptions.some((option) => option.bedrooms >= min)) return false;
  } else if (maxPriceCents != null) {
    if (project.priceFromCents == null || project.priceFromCents > maxPriceCents) return false;
  }

  if (filters.deliveryYear != null) {
    if (project.expectedDeliveryYear !== filters.deliveryYear) return false;
  }
  if (filters.deliveryUnknown) {
    const hasDate = project.expectedDeliveryYear != null;
    const hasNote = Boolean(project.deliveryNote && project.deliveryNote.trim() !== "");
    if (hasDate || hasNote) return false;
  }
  return true;
}

export function applyProjectFilters(
  projects: NewProjectSummary[],
  filters: NewProjectFilters,
): NewProjectSummary[] {
  return projects.filter((project) => projectMatchesFilters(project, filters));
}

export function buildNewProjectsHref(filters: NewProjectFilters): string {
  const params = new URLSearchParams();
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.maxPriceCop != null) params.set("maxPrice", String(filters.maxPriceCop));
  if (filters.minBedrooms != null) params.set("beds", String(filters.minBedrooms));
  if (filters.deliveryUnknown) params.set("delivery", "unknown");
  else if (filters.deliveryYear != null) params.set("delivery", String(filters.deliveryYear));
  const query = params.toString();
  return query ? `/new-projects?${query}` : "/new-projects";
}

export function countActiveFilters(filters: NewProjectFilters): number {
  return [
    filters.neighborhood != null,
    filters.maxPriceCop != null,
    filters.minBedrooms != null || filters.bedroomsExact != null,
    filters.deliveryYear != null || filters.deliveryUnknown,
  ].filter(Boolean).length;
}

export function hasActiveFilters(filters: NewProjectFilters): boolean {
  return countActiveFilters(filters) > 0;
}
