import type {
  DevelopmentProjectRow,
  DevelopmentProjectSourceRow,
  DevelopmentUnitTypeRow,
  NewProjectDetail,
  NewProjectSource,
  NewProjectSummary,
  NewProjectUnitType,
} from "./types";

export function bedroomRange(units: DevelopmentUnitTypeRow[]): {
  min: number | null;
  max: number | null;
} {
  const values = units
    .map((unit) => unit.bedrooms)
    .filter((value): value is number => value != null);
  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Distinct bedroom counts with the cheapest published price for each, so an exact-bedroom or a
 * combined budget+bedroom filter can be evaluated against a single real typology rather than the
 * project's overall price-from.
 */
export function bedroomOptions(
  units: DevelopmentUnitTypeRow[],
): NewProjectSummary["bedroomOptions"] {
  const cheapest = new Map<number, number | null>();
  for (const unit of units) {
    // development_unit_types.bedrooms is nullable (number | null): a typology with no recorded
    // bedroom count can never be matched by an exact or minimum bedroom filter.
    if (unit.bedrooms == null) continue;
    const current = cheapest.get(unit.bedrooms);
    const price = unit.price_from_cents;
    if (current === undefined) {
      cheapest.set(unit.bedrooms, price);
    } else if (price != null && (current == null || price < current)) {
      cheapest.set(unit.bedrooms, price);
    }
  }
  return [...cheapest.entries()]
    .map(([bedrooms, priceFromCents]) => ({ bedrooms, priceFromCents }))
    .sort((a, b) => a.bedrooms - b.bedrooms);
}

export function rowToSummary(
  row: DevelopmentProjectRow,
  units: DevelopmentUnitTypeRow[] = [],
): NewProjectSummary {
  const { min, max } = bedroomRange(units);
  return {
    id: row.id,
    sourceKey: row.source_key,
    slug: row.slug,
    name: row.name,
    sourceOwner: row.source_owner,
    city: row.city,
    neighborhood: row.neighborhood,
    projectStatus: row.project_status,
    priceFromCents: row.price_from_cents,
    priceToCents: row.price_to_cents,
    currency: row.currency,
    expectedDeliveryYear: row.expected_delivery_year,
    expectedDeliveryQuarter: row.expected_delivery_quarter,
    deliveryNote: row.delivery_note,
    visFlag: row.vis_flag,
    verifiedAt: row.verified_at,
    minBedrooms: min,
    maxBedrooms: max,
    unitTypeCount: units.length,
    bedroomOptions: bedroomOptions(units),
  };
}

export function rowToUnitType(row: DevelopmentUnitTypeRow): NewProjectUnitType {
  return {
    id: row.id,
    sourceKey: row.source_key,
    name: row.name,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    builtAreaM2: row.built_area_m2,
    privateAreaM2: row.private_area_m2,
    priceFromCents: row.price_from_cents,
    priceToCents: row.price_to_cents,
    currency: row.currency,
    availability: row.availability,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    verifiedAt: row.verified_at,
  };
}

export function rowToSource(row: DevelopmentProjectSourceRow): NewProjectSource {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    scope: row.scope,
    httpStatus: row.http_status,
    checkedAt: row.checked_at,
    sourceUpdatedAt: row.source_updated_at,
    factStatus: row.fact_status,
    confidence: row.confidence,
    observedFacts: row.observed_facts,
  };
}

export function buildDetail(
  row: DevelopmentProjectRow,
  units: DevelopmentUnitTypeRow[],
  sources: DevelopmentProjectSourceRow[],
): NewProjectDetail {
  return {
    ...rowToSummary(row, units),
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    constructionProgress: row.construction_progress,
    paymentPlan: row.payment_plan,
    amenities: row.amenities,
    sources: sources.map(rowToSource),
    unitTypes: units.map(rowToUnitType),
  };
}
