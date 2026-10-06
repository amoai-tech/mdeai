import type { Database, Json } from "@/lib/supabase/database.types";

/** Generated Supabase row shapes for the New Projects tables (SAN-1385 contract). */
export type DevelopmentProjectRow = Database["public"]["Tables"]["development_projects"]["Row"];
export type DevelopmentUnitTypeRow = Database["public"]["Tables"]["development_unit_types"]["Row"];
export type DevelopmentProjectSourceRow = Database["public"]["Tables"]["development_project_sources"]["Row"];

/** A single purchasable typology. Unknown facts stay `null` — never `0` or "available". */
export interface NewProjectUnitType {
  id: string;
  sourceKey: string;
  name: string;
  bedrooms: number | null;
  bathrooms: number | null;
  builtAreaM2: number | null;
  privateAreaM2: number | null;
  priceFromCents: number | null;
  priceToCents: number | null;
  currency: string;
  availability: string | null;
  sourceKind: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
}

/** One provenance row: what was checked, when, and how confident we are. */
export interface NewProjectSource {
  id: string;
  sourceUrl: string;
  sourceType: string;
  scope: string;
  httpStatus: number | null;
  checkedAt: string | null;
  sourceUpdatedAt: string | null;
  factStatus: string;
  confidence: string | null;
  observedFacts: Json;
}

/**
 * A known bedroom count and the cheapest published typology price for it, in cents.
 * `priceFromCents: null` means the typology exists but its price is not published — which must
 * NOT be treated as affordable when a budget is combined with a bedroom filter.
 */
export interface NewProjectBedroomOption {
  bedrooms: number;
  priceFromCents: number | null;
}

/** Browse-card view model. `null` means "not published" — the UI must say so, not show 0. */
export interface NewProjectSummary {
  id: string;
  sourceKey: string;
  slug: string;
  name: string;
  sourceOwner: string | null;
  city: string | null;
  neighborhood: string | null;
  projectStatus: string | null;
  priceFromCents: number | null;
  priceToCents: number | null;
  currency: string;
  expectedDeliveryYear: number | null;
  expectedDeliveryQuarter: number | null;
  deliveryNote: string | null;
  visFlag: boolean | null;
  verifiedAt: string | null;
  minBedrooms: number | null;
  maxBedrooms: number | null;
  unitTypeCount: number;
  /** Real typology bedroom options, so "2 bedroom" can mean exactly two, not "2 or more". */
  bedroomOptions: NewProjectBedroomOption[];
}

/** Profile view model: summary plus the facts and evidence shown on the detail page. */
export interface NewProjectDetail extends NewProjectSummary {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  constructionProgress: number | null;
  paymentPlan: string | null;
  amenities: string[] | null;
  sources: NewProjectSource[];
  unitTypes: NewProjectUnitType[];
}

export interface NewProjectFilters {
  neighborhood: string | null;
  /** Maximum price-from in COP pesos (not cents). */
  maxPriceCop: number | null;
  /** "2+ bedrooms" / "at least 2" — matches any typology with that many bedrooms or more. */
  minBedrooms: number | null;
  /** "2 bedroom" — matches a typology with exactly this bedroom count. Takes precedence. */
  bedroomsExact: number | null;
  /** Exact expected delivery year. */
  deliveryYear: number | null;
  /** Projects whose delivery date is not published. */
  deliveryUnknown: boolean;
}
