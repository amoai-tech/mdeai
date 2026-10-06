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
