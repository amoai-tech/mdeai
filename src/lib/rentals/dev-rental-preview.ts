/**
 * Local-only rental preview for SAN-1431.
 *
 * Does NOT change the publish RPC, RLS, listing eligibility, or production records.
 * Candidate metadata still comes from the staged research fixture; the image bytes
 * now come from the existing private `partner-assets` Storage bucket, addressed by
 * `rental_listing_images.sort_order`. Only the server-only service client reads the
 * private bucket, and it is imported exclusively by server components and the dev
 * photo route — never by a client component. A server-only flag AND
 * NODE_ENV=development are both required.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Rental } from "@/mastra/tools/search-rentals";
import type { RentalDetail } from "@/lib/rentals/get-rental-detail";
import { createServiceRoleClient } from "@/lib/supabase/service";

type Candidate = {
  slug: string;
  title: string;
  neighborhood: string | null;
  address: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  size_sqm: number | null;
  price_monthly: number;
  currency: string;
  description: string | null;
  amenities: string[] | null;
  building_amenities: string[] | null;
  source_url: string;
  metadata?: { original_listing_url?: string };
};

/** Existing private bucket that holds the source-review photos. */
const SOURCE_REVIEW_BUCKET = "partner-assets";
const SLUG = /^candidate-fincaraiz-\d{6,12}$/;
const PHOTO = /^photo-0([1-9])\.webp$/;

export function isLocalRentalPreviewEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  flag: string | undefined = process.env.MDE_DEV_RENTAL_PREVIEW,
): boolean {
  return nodeEnv === "development" && flag === "1";
}

function fixtureRoot(): string {
  return process.env.MDE_DEV_RENTAL_FIXTURES_DIR?.trim() ||
    path.join(process.cwd(), "photos", "medellin_furnished_import");
}

function validCandidate(value: unknown): value is Candidate {
  if (value === null || typeof value !== "object") return false;
  const r = value as Partial<Candidate>;
  return typeof r.slug === "string" && SLUG.test(r.slug) &&
    typeof r.title === "string" &&
    typeof r.price_monthly === "number" && r.price_monthly > 0 &&
    r.currency === "COP" && typeof r.source_url === "string" &&
    // Eight source rows retain an aggregator URL while the original Fincaraíz
    // link is in metadata. Accept only the known domains; do not accept any URL.
    (r.source_url.startsWith("https://www.fincaraiz.com.co/") ||
      (r.source_url.startsWith("https://co.inmuebles.eu.org/") &&
       r.metadata?.original_listing_url?.startsWith("https://www.fincaraiz.com.co/") === true));
}

async function candidates(): Promise<Candidate[]> {
  if (!isLocalRentalPreviewEnabled()) return [];
  const data = JSON.parse(await readFile(path.join(fixtureRoot(), "supabase_draft_records.json"), "utf8")) as unknown;
  if (!Array.isArray(data) || !data.every(validCandidate)) {
    throw new Error("Local rental preview candidates are missing or invalid");
  }
  return data;
}

type ListingImageRow = {
  sort_order: number;
  storage_path: string;
  mime_type: string | null;
};

/**
 * The staged photos for a candidate, ordered exactly as uploaded. Uses the
 * server-only service client because `partner-assets` is a private bucket; the
 * credential never leaves the server process.
 */
async function listingImages(slug: string): Promise<ListingImageRow[]> {
  const client = createServiceRoleClient();
  if (!client) return [];
  const { data: apartment, error: apartmentError } = await client
    .from("apartments")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (apartmentError || !apartment) return [];
  const { data, error } = await client
    .from("rental_listing_images")
    .select("sort_order, storage_path, mime_type")
    .eq("listing_id", apartment.id)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as ListingImageRow[];
}

function photoUrl(slug: string, position: number): string {
  return `/api/dev/rental-photo/${slug}/photo-0${position + 1}.webp`;
}

async function photos(slug: string): Promise<string[]> {
  if (!isLocalRentalPreviewEnabled()) return [];
  const rows = await listingImages(slug);
  // Address photos by their sort-order position so a gap can never shift one
  // unit's image onto another, and a missing row simply stays absent.
  return rows.map((_row, index) => photoUrl(slug, index));
}

export type DevPreviewPhoto = { bytes: ArrayBuffer; contentType: string };

/**
 * Stream one staged photo from the private bucket. The dev route is the existing
 * authorized delivery mechanism: it keeps the bucket private and avoids putting a
 * service-role read or an expiring URL into the browser.
 */
export async function getLocalPreviewPhoto(
  slug: string,
  filename: string,
): Promise<DevPreviewPhoto | null> {
  if (!isLocalRentalPreviewEnabled() || !SLUG.test(slug)) return null;
  const match = PHOTO.exec(filename);
  if (!match) return null;
  const client = createServiceRoleClient();
  if (!client) return null;
  const row = (await listingImages(slug))[Number(match[1]) - 1];
  if (!row) return null;
  const objectPath = row.storage_path.startsWith(`${SOURCE_REVIEW_BUCKET}/`)
    ? row.storage_path.slice(SOURCE_REVIEW_BUCKET.length + 1)
    : row.storage_path;
  const { data, error } = await client.storage.from(SOURCE_REVIEW_BUCKET).download(objectPath);
  if (error || !data) return null;
  return { bytes: await data.arrayBuffer(), contentType: row.mime_type ?? "image/webp" };
}

export async function getLocalPreviewRentals(): Promise<Rental[]> {
  const list = await candidates();
  return Promise.all(list.map(async (c): Promise<Rental> => {
    const image = (await photos(c.slug))[0] ?? "";
    return {
      id: c.slug,
      title: c.title,
      neighborhood: c.neighborhood ?? "",
      // Type contract requires a number. The browse card deliberately suppresses
      // nightly pricing for development candidates; only source monthly rent is shown.
      nightly_price: Math.round(c.price_monthly / 30),
      price_monthly: c.price_monthly,
      currency: c.currency,
      bedrooms: c.bedrooms ?? 0,
      wifi: false,
      amenities: c.amenities ?? [],
      image,
      source_url: c.metadata?.original_listing_url ?? c.source_url,
      can_schedule_viewing: false,
      schedule_viewing_url: null,
      host_name: "External advertiser — unverified",
      availability: "Availability unconfirmed · Development preview",
      tags: ["dev-preview"],
      // No verified coordinates means no map pin.
    };
  }));
}

export async function getLocalPreviewDetail(id: string): Promise<RentalDetail | null> {
  if (!isLocalRentalPreviewEnabled() || !SLUG.test(id)) return null;
  const c = (await candidates()).find((row) => row.slug === id);
  if (!c) return null;
  return {
    id: c.slug,
    slug: c.slug,
    title: c.title,
    neighborhood: c.neighborhood ?? "",
    address: c.address,
    bedrooms: c.bedrooms,
    bathrooms: c.bathrooms,
    maxGuests: null,
    priceNightly: null,
    priceMonthly: c.price_monthly,
    currency: c.currency,
    deposit: null,
    amenities: c.amenities ?? [],
    buildingAmenities: c.building_amenities ?? [],
    images: await photos(c.slug),
    description: c.description,
    houseRules: null,
    hostName: null,
    availableFrom: null,
    availableTo: null,
    minimumStayDays: null,
    maximumStayDays: null,
    latitude: null,
    longitude: null,
    status: "development-preview",
    canScheduleViewing: false,
  };
}
