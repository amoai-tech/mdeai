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
const CANDIDATE_PREFIX = "candidate-fincaraiz-";
const PHOTO = /^photo-0([1-9])\.webp$/;

/**
 * Anchored, linear candidate-slug check. Written without a regex on the
 * user-supplied value so it cannot be mistaken for a backtracking pattern; the
 * format is a known prefix plus 6–12 digits.
 */
function isCandidateSlug(value: string): boolean {
  if (!value.startsWith(CANDIDATE_PREFIX)) return false;
  const suffix = value.slice(CANDIDATE_PREFIX.length);
  if (suffix.length < 6 || suffix.length > 12) return false;
  for (let index = 0; index < suffix.length; index += 1) {
    const code = suffix.charCodeAt(index);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

export function isLocalRentalPreviewEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  flag: string | undefined = process.env.MDE_DEV_RENTAL_PREVIEW,
): boolean {
  return nodeEnv === "development" && flag === "1";
}

/**
 * Only a genuinely local request may see the research fixture and its private
 * photos. A tunnel (ngrok, Cloudflare) or a dev server bound to 0.0.0.0 changes
 * the Host header, so it fails this check and the preview 404s instead of
 * exposing research material to whoever can reach the port.
 */
export function isLocalPreviewHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const value = host.trim().toLowerCase();
  const hostname = value.startsWith("[")
    ? value.slice(1, value.indexOf("]"))
    : value.split(":")[0];
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "0:0:0:0:0:0:0:1"
  );
}

/**
 * Headers a reverse proxy or tunnel adds. A direct loopback request has none, so a
 * Host that looks local but arrives through a proxy (ngrok, Cloudflare) is refused.
 */
/** Headers that carry the peer/proxy address; Next dev sets them to the loopback peer. */
const FORWARDING_HEADERS = [
  "x-forwarded-for",
  "x-forwarded-host",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "cf-ray",
] as const;

/**
 * Only the standard `get` is needed, so this stays framework-agnostic and mockable
 * while still matching Next's `ReadonlyHeaders`.
 */
type HeaderLookup = Pick<Headers, "get">;

const LOOPBACK_NAMES = new Set(["127.0.0.1", "localhost", "::1", "0:0:0:0:0:0:0:1", "[::1]"]);

/**
 * True when a header value (or its first entry in a comma list) is loopback.
 * Next dev fills `x-forwarded-*` with the loopback peer, so those values pass; a
 * tunnel or reverse proxy fills them with the real client IP or public host and fails.
 */
function isLoopbackValue(raw: string | null): boolean {
  if (!raw) return true;
  const first = raw.split(",")[0]?.trim().toLowerCase() ?? "";
  if (LOOPBACK_NAMES.has(first)) return true;
  const bare = first.startsWith("[") ? first.slice(1, first.indexOf("]")) : first.split(":")[0];
  return LOOPBACK_NAMES.has(bare) || bare.startsWith("127.");
}

/**
 * Full preview access check: a loopback Host AND forwarding headers that all still
 * point at loopback. A Host alone is caller-supplied, so the forwarded values catch a
 * request that reached us through a tunnel while claiming a local Host.
 */
export function isLocalPreviewRequest(
  host: string | null | undefined,
  headers?: HeaderLookup | null,
): boolean {
  if (!isLocalPreviewHost(host)) return false;
  if (!headers) return true;
  return FORWARDING_HEADERS.every((name) => isLoopbackValue(headers.get(name)));
}

/** Fixture array fields must be string arrays (or absent), or the UI can crash. */
function isStringArrayOrAbsent(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function fixtureRoot(): string {
  return process.env.MDE_DEV_RENTAL_FIXTURES_DIR?.trim() ||
    path.join(process.cwd(), "photos", "medellin_furnished_import");
}

function validCandidate(value: unknown): value is Candidate {
  if (value === null || typeof value !== "object") return false;
  const r = value as Partial<Candidate>;
  return typeof r.slug === "string" && isCandidateSlug(r.slug) &&
    typeof r.title === "string" &&
    typeof r.price_monthly === "number" && r.price_monthly > 0 &&
    r.currency === "COP" && typeof r.source_url === "string" &&
    isStringArrayOrAbsent(r.amenities) && isStringArrayOrAbsent(r.building_amenities) &&
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

type ListingImages = {
  apartmentId: string;
  rows: ListingImageRow[];
  availableFrom: string | null;
  latitude: number | null;
  longitude: number | null;
};

const IMAGE_CACHE_TTL_MS = 30_000;
const imageCache = new Map<string, { at: number; value: ListingImages | null }>();

/** @internal Vitest only */
export function resetLocalPreviewImageCache(): void {
  imageCache.clear();
}

function warn(message: string): void {
  // Observability only: a missing credential or a DB/Storage error must be visible
  // in the dev server log instead of silently rendering empty galleries.
  console.warn(`[dev-rental-preview] ${message}`);
}

/**
 * The staged photos for a candidate keyed by its apartment id, with a short TTL
 * cache so a nine-card page and its image requests do not each re-query Supabase.
 * Uses the server-only service client because `partner-assets` is private.
 */
async function listingImages(slug: string): Promise<ListingImages | null> {
  const cached = imageCache.get(slug);
  if (cached && Date.now() - cached.at < IMAGE_CACHE_TTL_MS) return cached.value;

  const client = createServiceRoleClient();
  if (!client) {
    warn("service-role client unavailable; is SUPABASE_SERVICE_ROLE_KEY set?");
    imageCache.set(slug, { at: Date.now(), value: null });
    return null;
  }
  const { data: apartment, error: apartmentError } = await client
    .from("apartments")
    .select("id, available_from, latitude, longitude, metadata")
    .eq("slug", slug)
    .maybeSingle();
  if (apartmentError) warn(`apartment lookup failed for ${slug}: ${apartmentError.message}`);
  if (!apartment) {
    imageCache.set(slug, { at: Date.now(), value: null });
    return null;
  }
  const { data, error } = await client
    .from("rental_listing_images")
    .select("sort_order, storage_path, mime_type")
    .eq("listing_id", apartment.id)
    .order("sort_order", { ascending: true });
  if (error) warn(`image lookup failed for ${slug}: ${error.message}`);
  // Development-only facts come from the live apartment row, not stale local
  // research fixtures. Only the user's dated availability attestation and
  // Google's rooftop-address receipt can create a preview date or pin.
  const metadata = (apartment.metadata ?? {}) as Record<string, unknown>;
  const availabilityEvidence = (metadata.development_availability_attestation ?? {}) as Record<string, unknown>;
  const mapEvidence = (metadata.map_geocoding ?? {}) as Record<string, unknown>;
  const availableFrom = typeof apartment.available_from === "string"
    && availabilityEvidence.available_from === apartment.available_from
    ? apartment.available_from : null;
  const latitude = apartment.latitude == null ? null : Number(apartment.latitude);
  const longitude = apartment.longitude == null ? null : Number(apartment.longitude);
  const mapped = mapEvidence.provider === "google_geocoding_api"
    && mapEvidence.location_type === "ROOFTOP"
    && latitude !== null && longitude !== null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
  const value: ListingImages = {
    apartmentId: apartment.id,
    rows: error || !data ? [] : (data as ListingImageRow[]),
    availableFrom,
    latitude: mapped ? latitude : null,
    longitude: mapped ? longitude : null,
  };
  imageCache.set(slug, { at: Date.now(), value });
  return value;
}

/** `photo-01.webp` → sort_order 0. Explicit, so a missing row never shifts a photo. */
function sortOrderForFilename(filename: string): number | null {
  const match = PHOTO.exec(filename);
  return match ? Number(match[1]) - 1 : null;
}

function photoUrl(slug: string, sortOrder: number): string {
  return `/api/dev/rental-photo/${slug}/photo-${String(sortOrder + 1).padStart(2, "0")}.webp`;
}

async function photos(slug: string): Promise<string[]> {
  if (!isLocalRentalPreviewEnabled()) return [];
  const images = await listingImages(slug);
  return (images?.rows ?? []).map((row) => photoUrl(slug, row.sort_order));
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
  if (!isLocalRentalPreviewEnabled() || !isCandidateSlug(slug)) return null;
  const sortOrder = sortOrderForFilename(filename);
  if (sortOrder === null) return null;

  const images = await listingImages(slug);
  if (!images) return null;
  const row = images.rows.find((candidate) => candidate.sort_order === sortOrder);
  if (!row) return null;

  // Allowlisted path: only this apartment's own source-review prefix, with a safe
  // basename, can be read even if a database row were tampered with.
  const prefix = `${SOURCE_REVIEW_BUCKET}/source-review/fincaraiz/${images.apartmentId}/`;
  if (!row.storage_path.startsWith(prefix)) {
    warn(`refusing non-allowlisted storage path for ${slug}`);
    return null;
  }
  const objectPath = row.storage_path.slice(SOURCE_REVIEW_BUCKET.length + 1);
  const basename = objectPath.slice(objectPath.lastIndexOf("/") + 1);
  if (basename.includes("..") || !/^[A-Za-z0-9._-]+$/.test(basename)) {
    warn(`refusing unsafe storage basename for ${slug}`);
    return null;
  }

  const client = createServiceRoleClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(SOURCE_REVIEW_BUCKET).download(objectPath);
  if (error || !data) {
    warn(`storage download failed for ${slug} (${sortOrder}): ${error?.message ?? "no data"}`);
    return null;
  }
  return { bytes: await data.arrayBuffer(), contentType: row.mime_type ?? "image/webp" };
}

export async function getLocalPreviewRentals(): Promise<Rental[]> {
  const list = await candidates();
  return Promise.all(list.map(async (c): Promise<Rental> => {
    const listing = await listingImages(c.slug);
    const image = (await photos(c.slug))[0] ?? "";
    return {
      id: c.slug,
      title: c.title,
      neighborhood: c.neighborhood ?? "",
      // No invented nightly figure: these candidates only publish a monthly rent. The
      // shared contract keeps nightly as a number, so 0 is the explicit "no nightly
      // price" value and the browse card already suppresses it for dev-preview.
      nightly_price: 0,
      price_monthly: c.price_monthly,
      currency: c.currency,
      // The numeric contract stays 0; the flag is what lets the card say "unknown".
      bedrooms: c.bedrooms ?? 0,
      bedrooms_unknown: c.bedrooms == null,
      wifi: false,
      amenities: c.amenities ?? [],
      image,
      source_url: c.metadata?.original_listing_url ?? c.source_url,
      can_schedule_viewing: false, // source-only preview: no persisted MDE booking target
      schedule_viewing_url: null,
      host_name: "External advertiser — unverified",
      availability: listing?.availableFrom
        ? `Available from ${listing.availableFrom} (user-reported) · Development preview`
        : "Availability unconfirmed · Development preview",
      tags: ["dev-preview"],
      // Only Google rooftop-address coordinates with a stored receipt become pins.
      latitude: listing?.latitude ?? undefined,
      longitude: listing?.longitude ?? undefined,
    };
  }));
}

export async function getLocalPreviewDetail(id: string): Promise<RentalDetail | null> {
  if (!isLocalRentalPreviewEnabled() || !isCandidateSlug(id)) return null;
  const c = (await candidates()).find((row) => row.slug === id);
  if (!c) return null;
  const listing = await listingImages(id);
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
    availableFrom: listing?.availableFrom ?? null,
    availableTo: null,
    minimumStayDays: null,
    maximumStayDays: null,
    latitude: listing?.latitude ?? null,
    longitude: listing?.longitude ?? null,
    status: "development-preview",
    canScheduleViewing: false,
    isNotIndependentlyVerified: false,
    sourceUrl: c.metadata?.original_listing_url ?? c.source_url,
    sourceProvider: null,
    isExternalSource: false,
  };
}
