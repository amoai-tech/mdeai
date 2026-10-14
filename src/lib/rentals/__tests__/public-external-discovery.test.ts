import { describe, expect, it, vi } from "vitest";
const searchMock = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const result = { data: searchMock.rows, error: null };
      const query = {
        select: () => query,
        in: () => query,
        eq: () => query,
        contains: (_column: string, expected: Record<string, unknown>) => {
          return {
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({
              data: searchMock.rows.filter((row) => {
                const metadata = row.metadata as Record<string, unknown> | undefined;
                return Object.entries(expected).every(([key, value]) => metadata?.[key] === value);
              }),
              error: null,
            }).then(resolve),
          };
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    },
  }),
}));

import { publicExternalRentalCard, searchPublicExternalRentals } from "../public-external-discovery";

const base = {
  landlord_id: "a4da05ae-347e-4250-8ae0-83812ccc7703",
  verified: false,
  status: "inactive",
  listing_workflow_status: "draft",
  moderation_status: "pending",
  slug: "candidate-fincaraiz-193916988",
  title: "Furnished apartment in Conquistadores",
  neighborhood: "Conquistadores",
  source_url: "https://www.fincaraiz.com.co/apartaestudio-en-arriendo-en-conquistadores-medellin/193916988",
  price_monthly: 2100000,
  currency: "COP",
  bedrooms: null,
  amenities: ["workspace"],
  latitude: 6.2422222,
  longitude: -75.5864818,
  available_from: "2026-10-14",
  available_to: null,
  images: [],
  metadata: {
    inventory_kind: "external_candidate",
    allowed_action: "view_original_listing",
    external_discovery_publication: "user_authorized_2026-10-14",
    public_photo_republication_permission: "user_attested_2026-10-14",
    map_geocoding: { provider: "google_geocoding_api", location_type: "ROOFTOP" },
  },
};

describe("public external source cards", () => {
  it("displays only source-linked facts without falsely enabling bookings or verified badges", () => {
    const rental = publicExternalRentalCard(base);
    expect(rental).toMatchObject({
      price_monthly: 2100000, currency: "COP", nightly_price: 0,
      bedrooms: 0, bedrooms_unknown: true,
      can_schedule_viewing: false, schedule_viewing_url: null,
      image: "", latitude: 6.2422222, longitude: -75.5864818,
    });
    expect(rental?.tags).toContain("not-verified");
    expect(rental?.source_url).toContain("fincaraiz.com.co");
  });

  it("refuses unapproved source ads, other domains, and other candidates", () => {
    expect(publicExternalRentalCard({ ...base, metadata: { ...base.metadata, external_discovery_publication: "development_only" } })).toBeNull();
    expect(publicExternalRentalCard({ ...base, metadata: { ...base.metadata, public_photo_republication_permission: "pending" } })).toBeNull();
    expect(publicExternalRentalCard({
      ...base,
      metadata: {inventory_kind: "external_candidate", allowed_action: "view_original_listing",
        external_discovery_publication: "user_authorized_2026-10-14"},
    })).toBeNull();
    expect(publicExternalRentalCard({ ...base, source_url: "https://evil.example/rental" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, slug: "other-landlord-private-draft" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, landlord_id: "another-profile" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, verified: true })).toBeNull();
    expect(publicExternalRentalCard({ ...base, status: "active" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, listing_workflow_status: "published" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, moderation_status: "approved" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, metadata: { ...base.metadata, allowed_action: "schedule_viewing" } })).toBeNull();
  });

  it("does not gate approved external ads on the canonical photo-rights status", () => {
    const ad = publicExternalRentalCard({
      ...base,
      metadata: {
        ...base.metadata,
        photo_rights_status: "unverified",
        public_photo_republication_permission: "user_attested_2026-10-14",
      },
    });
    expect(ad?.id).toBe(base.slug);
    expect(ad?.can_schedule_viewing).toBe(false);
    expect(ad?.source_url).toBe(base.source_url);
  });

  it("displays a public listing-photo URL, not arbitrary or private Storage media", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://zkwcbyxiwklihegjhuql.supabase.co";
    try {
      const photo = "https://zkwcbyxiwklihegjhuql.supabase.co/storage/v1/object/public/listing-photos/external-discovery/fincaraiz/candidate-fincaraiz-193916988/photo-01.webp";
      expect(publicExternalRentalCard({ ...base, images: [photo] })?.image).toBe(photo);
      expect(publicExternalRentalCard({ ...base, images: ["https://example.net/other.webp"] })?.image).toBe("");
      expect(publicExternalRentalCard({ ...base, images: ["https://zkwcbyxiwklihegjhuql.supabase.co/storage/v1/object/public/partner-assets/foo.webp"] })?.image).toBe("");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });

  it("accepts Fincaraíz source links without the www subdomain", () => {
    const result = publicExternalRentalCard({ ...base, source_url: "https://fincaraiz.com.co/apartamento/193916988" });
    expect(result?.source_url).toContain("https://fincaraiz.com.co/");
  });

  it("omits uncertain and street-interpolated map pins", () => {
    const approximate = publicExternalRentalCard({
      ...base,
      metadata: { ...base.metadata, map_geocoding: { provider: "google_geocoding_api", location_type: "RANGE_INTERPOLATED" } },
    });
    expect(approximate?.latitude).toBeUndefined();
    expect(approximate?.longitude).toBeUndefined();
    const unknown = publicExternalRentalCard({ ...base, latitude: null, longitude: null });
    expect(unknown?.latitude).toBeUndefined();
  });

  it("rejects invalid prices without defaulting to a fake rental price", () => {
    expect(publicExternalRentalCard({ ...base, price_monthly: null })).toBeNull();
    expect(publicExternalRentalCard({ ...base, currency: "USD" })).toBeNull();
  });
});

describe("public external rental search date filtering", () => {
  it("never presents a COP/month advertisement as matching a USD/night budget", async () => {
    searchMock.rows = [{ ...base }];
    expect(await searchPublicExternalRentals({ maxPricePerNight: 80, limit: 8 })).toEqual([]);
  });

  it("filters using the native DATE column, not a sliced display label", async () => {
    searchMock.rows = [{ ...base }];
    const tooEarly = await searchPublicExternalRentals({ checkOut: "2026-10-13", limit: 9 });
    expect(tooEarly).toHaveLength(0);
    const eligible = await searchPublicExternalRentals({ checkOut: "2026-10-15", limit: 9 });
    expect(eligible).toHaveLength(1);
    expect(eligible[0]?.availability).toContain("Available from 2026-10-14");
  });

  it("excludes unpermissioned external records at the Supabase search gate", async () => {
    searchMock.rows = [
      {...base, metadata: {...base.metadata, public_photo_republication_permission: "pending"}},
      {...base},
    ];
    const result = await searchPublicExternalRentals({limit: 9});
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(base.slug);
  });

  it("does not claim past dates when a source end date is recorded", async () => {
    searchMock.rows = [{ ...base, available_to: "2026-10-31" }];
    expect(await searchPublicExternalRentals({ checkIn: "2026-11-01", limit: 9 })).toHaveLength(0);
    expect(await searchPublicExternalRentals({ checkIn: "2026-10-30", limit: 9 })).toHaveLength(1);
  });
});
