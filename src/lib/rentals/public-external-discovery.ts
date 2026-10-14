/**
 * Explicit public discovery of source-linked third-party advertisements.
 * This does NOT publish these drafts as verified MDE inventory or enable viewing.
 * Only safe, already-advertised fields leave this server-side module.
 */
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Rental, RentalQuery } from "@/mastra/tools/search-rentals";

const PUBLIC_SOURCE_SLUGS = [
  "candidate-fincaraiz-193916988",
  "candidate-fincaraiz-192658136",
  "candidate-fincaraiz-194158672",
  "candidate-fincaraiz-194188459",
  "candidate-fincaraiz-193811264",
  "candidate-fincaraiz-194104380",
  "candidate-fincaraiz-194115640",
  "candidate-fincaraiz-194096982",
  "candidate-fincaraiz-193522702",
] as const;

const AUTHORIZED_LANDLORD_PROFILE = "a4da05ae-347e-4250-8ae0-83812ccc7703";

type ExternalListing = {
  landlord_id: string;
  slug: string; title: string; neighborhood: string | null;
  source_url: string | null; price_monthly: number | string | null;
  currency: string | null; bedrooms: number | null;
  amenities: string[] | null; latitude: number | null; longitude: number | null;
  available_from: string | null; available_to: string | null;
  metadata: Record<string, unknown> | null;
};

export function publicExternalRentalCard(row: ExternalListing): Rental | null {
  const metadata = row.metadata ?? {};
  if (row.landlord_id !== AUTHORIZED_LANDLORD_PROFILE
      || !PUBLIC_SOURCE_SLUGS.includes(row.slug as typeof PUBLIC_SOURCE_SLUGS[number])
      || metadata.inventory_kind !== "external_candidate"
      || metadata.allowed_action !== "view_original_listing"
      || metadata.external_discovery_publication !== "user_authorized_2026-10-14"
      || !row.source_url?.startsWith("https://www.fincaraiz.com.co/")
      || row.currency !== "COP"
      || !(Number(row.price_monthly) > 0)) return null;
  const evidence = metadata.map_geocoding;
  const mapReceipt = evidence && typeof evidence === "object"
    ? evidence as Record<string, unknown> : {};
  const hasMap = mapReceipt.provider === "google_geocoding_api"
    && mapReceipt.location_type === "ROOFTOP"
    && row.latitude != null && row.longitude != null
    && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
    && Number(row.latitude) >= -90 && Number(row.latitude) <= 90
    && Number(row.longitude) >= -180 && Number(row.longitude) <= 180;
  return {
    id: row.slug, title: row.title, neighborhood: row.neighborhood ?? "",
    nightly_price: 0, price_monthly: Number(row.price_monthly), currency: "COP",
    bedrooms: row.bedrooms ?? 0, bedrooms_unknown: row.bedrooms == null,
    wifi: false, amenities: row.amenities ?? [], image: "",
    source_url: row.source_url, can_schedule_viewing: false,
    schedule_viewing_url: null, host_name: "External advertisement",
    availability: row.available_from
      ? "Available from " + row.available_from + " (reported; unverified)"
      : "Availability not verified",
    tags: ["external-source", "not-verified"],
    ...(hasMap ? { latitude: Number(row.latitude), longitude: Number(row.longitude) } : {}),
  };
}

/** Search only the approved nine external source ads, not private broker inventory. */
export async function searchPublicExternalRentals(query: RentalQuery): Promise<Rental[]> {
  const client = createServiceRoleClient();
  if (!client) return [];
  const { data, error } = await client.from("apartments")
    .select("landlord_id,slug,title,neighborhood,source_url,price_monthly,currency,bedrooms,amenities,latitude,longitude,available_from,available_to,metadata")
    .in("slug", [...PUBLIC_SOURCE_SLUGS])
    .eq("landlord_id", AUTHORIZED_LANDLORD_PROFILE)
    .eq("status", "inactive")
    .eq("listing_workflow_status", "draft")
    .eq("moderation_status", "pending");
  if (error) throw new Error("Public external discovery temporarily unavailable");

  return (data ?? [])
    .map((row) => publicExternalRentalCard(row as ExternalListing))
    .filter((row): row is Rental => row !== null)
    .filter((row) => {
      if (query.neighborhood && !row.neighborhood.toLocaleLowerCase()
        .includes(query.neighborhood.toLocaleLowerCase())) return false;
      if (query.minBedrooms != null && (row.bedrooms_unknown || row.bedrooms < query.minBedrooms)) return false;
      // A USD/night budget cannot be applied to a COP/month source advertisement.
      if (query.checkOut && row.availability.includes("Available from ")) {
        const date = row.availability.slice("Available from ".length, "Available from ".length + 10);
        if (date > query.checkOut) return false;
      }
      return true;
    });
}
