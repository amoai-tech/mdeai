/**
 * Local-only rental preview for SAN-1431.
 *
 * Does NOT change the publish RPC, RLS, listing eligibility, or production records.
 * The preview consumes existing research fixtures and local photos, not public Storage.
 * A server-only flag AND NODE_ENV=development are both required.
 */
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { Rental } from "@/mastra/tools/search-rentals";
import type { RentalDetail } from "@/lib/rentals/get-rental-detail";

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

const SLUG = /^candidate-fincaraiz-\d{6,12}$/;
const PHOTO = /^photo-0[1-4]\.webp$/;

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

export async function getLocalPreviewPhoto(slug: string, filename: string): Promise<Buffer | null> {
  if (!isLocalRentalPreviewEnabled() || !SLUG.test(slug) || !PHOTO.test(filename)) return null;
  // Only photos for known source candidates, even if a caller guesses a filename.
  if (!(await candidates()).some((c) => c.slug === slug)) return null;
  try {
    return await readFile(path.join(fixtureRoot(), "photos", slug, filename));
  } catch {
    return null;
  }
}

async function photos(slug: string): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 1; i <= 4; i += 1) {
    const file = `photo-0${i}.webp`;
    try {
      await access(path.join(fixtureRoot(), "photos", slug, file));
      urls.push(`/api/dev/rental-photo/${slug}/${file}`);
    } catch {
      // An unknown/missing photo stays absent; never use a wrong unit's image.
    }
  }
  return urls;
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
