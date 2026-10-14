import { describe, expect, it, vi } from "vitest";
const searchMock = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      // Mirror PostgREST filters: tests must fail if SQL accidentally retains
      // draft-only predicates after source advertisements are published.
      let rows = [...searchMock.rows];
      const query = {
        select: () => query,
        in: (column: string, values: string[]) => {
          rows = rows.filter((row) => values.includes(String(row[column])));
          return query;
        },
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        contains: (column: string, expected: Record<string, unknown>) => {
          rows = rows.filter((row) => {
            const field = row[column] as Record<string, unknown> | undefined;
            return Object.entries(expected).every(([key, value]) => field?.[key] === value);
          });
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
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
    // Partial transitions do not qualify: only the old draft state or the
    // complete active/approved/published state may display a source card.
    expect(publicExternalRentalCard({ ...base, verified: true })).toBeNull();
    expect(publicExternalRentalCard({ ...base, status: "active" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, listing_workflow_status: "published" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, moderation_status: "approved" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, metadata: { ...base.metadata, allowed_action: "schedule_viewing" } })).toBeNull();
  });

  it("keeps published source cards discoverable regardless of their independent verified flag", () => {
    for (const verified of [true, false]) {
      const published = publicExternalRentalCard({
        ...base, verified, status: "active", moderation_status: "approved",
        listing_workflow_status: "published",
      });
      expect(published?.id).toBe(base.slug);
      expect(published?.can_schedule_viewing).toBe(false);
      expect(published?.source_url).toBe(base.source_url);
      expect(published?.tags).toContain("external-source");
      // A database boolean does not turn a source ad into a verified MDE offering.
      expect(published?.tags).toContain("not-verified");
    }
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

  it("renders the placeholder while republication is unapproved, even for approved or foreign URLs", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://zkwcbyxiwklihegjhuql.supabase.co";
    try {
      const photo = "https://zkwcbyxiwklihegjhuql.supabase.co/storage/v1/object/public/listing-photos/external-discovery/fincaraiz/candidate-fincaraiz-193916988/photo-01.webp";
      expect(publicExternalRentalCard({ ...base, images: [photo] })?.image).toBe("");
      expect(publicExternalRentalCard({ ...base, images: ["https://example.net/other.webp"] })?.image).toBe("");
      expect(publicExternalRentalCard({ ...base, images: ["https://zkwcbyxiwklihegjhuql.supabase.co/storage/v1/object/public/partner-assets/foo.webp"] })?.image).toBe("");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });

  it("does not serve the approved photos while republication is unapproved (SAN-1416 fallback)", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://zkwcbyxiwklihegjhuql.supabase.co";
    try {
      const dir = "https://zkwcbyxiwklihegjhuql.supabase.co/storage/v1/object/public/listing-photos/external-discovery/fincaraiz/candidate-fincaraiz-193916988";
      const approved = [1, 2, 3, 4, 5, 6].map((n) => `${dir}/photo-0${n}.webp`);
      const ad = publicExternalRentalCard({ ...base, images: approved });
      expect(ad?.images).toEqual([]);
      expect(ad?.image).toBe("");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });

  it("serves no public photos while republication is unapproved, even when a valid URL is stored", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://zkwcbyxiwklihegjhuql.supabase.co";
    try {
      const origin = "https://zkwcbyxiwklihegjhuql.supabase.co/storage/v1/object";
      const good = `${origin}/public/listing-photos/external-discovery/fincaraiz/candidate-fincaraiz-193916988/photo-02.webp`;
      const ad = publicExternalRentalCard({
        ...base,
        images: [
          "not a url", // malformed: skipped, must not discard the rest
          "https://example.net/other.webp", // foreign host
          `${origin}/public/partner-assets/foo.webp`, // another bucket
          `${origin}/public/listing-photos/external-discovery/fincaraiz/candidate-fincaraiz-192658136/photo-01.webp`, // another listing's folder
          `${origin}/public/listing-photos/external-discovery/fincaraiz/candidate-fincaraiz-193916988/photo-03.jpg`, // wrong type
          `${origin}/sign/listing-photos/external-discovery/fincaraiz/candidate-fincaraiz-193916988/photo-04.webp`, // signed/private path
          good,
        ],
      });
      expect(ad?.images).toEqual([]);
      expect(ad?.image).toBe("");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });

  it("has no photos, and an empty list, when none are approved or the storage origin is unknown", () => {
    const ad = publicExternalRentalCard({ ...base, images: ["https://example.net/a.webp"] });
    expect(ad?.images).toEqual([]);
    expect(ad?.image).toBe("");
  });

  it("warns (slug and count only) when every stored photo is rejected, and stays quiet otherwise", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://zkwcbyxiwklihegjhuql.supabase.co";
    try {
      publicExternalRentalCard({ ...base, images: ["https://example.net/a.webp", "not a url"] });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(base.slug);
      expect(warn.mock.calls[0][0]).toContain("2 stored photo(s)");
      expect(warn.mock.calls[0][0]).not.toContain("example.net");
      warn.mockClear();
      publicExternalRentalCard({ ...base, images: [] }); // nothing stored: nothing to report
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
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
  it("finds all nine already-published source ads, including mixed verified booleans", async () => {
    const slugs = [
      "candidate-fincaraiz-193916988", "candidate-fincaraiz-192658136",
      "candidate-fincaraiz-194158672", "candidate-fincaraiz-194188459",
      "candidate-fincaraiz-193811264", "candidate-fincaraiz-194104380",
      "candidate-fincaraiz-194115640", "candidate-fincaraiz-194096982",
      "candidate-fincaraiz-193522702",
    ];
    searchMock.rows = slugs.map((slug, i) => ({
      ...base, slug, verified: i < 4,
      status: "active", moderation_status: "approved",
      listing_workflow_status: "published",
    }));
    const ads = await searchPublicExternalRentals({ limit: 24 });
    expect(ads).toHaveLength(9);
    expect(ads.map((row) => row.id).sort()).toEqual([...slugs].sort());
    expect(ads.every((row) => row.can_schedule_viewing === false && row.source_url.includes("fincaraiz.com.co"))).toBe(true);
  });


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
