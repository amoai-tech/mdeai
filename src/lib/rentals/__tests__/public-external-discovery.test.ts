import { describe, expect, it } from "vitest";
import { publicExternalRentalCard } from "../public-external-discovery";

const base = {
  landlord_id: "a4da05ae-347e-4250-8ae0-83812ccc7703",
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
  metadata: {
    inventory_kind: "external_candidate",
    allowed_action: "view_original_listing",
    external_discovery_publication: "user_authorized_2026-10-14",
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
    expect(publicExternalRentalCard({ ...base, source_url: "https://evil.example/rental" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, slug: "other-landlord-private-draft" })).toBeNull();
    expect(publicExternalRentalCard({ ...base, landlord_id: "another-profile" })).toBeNull();
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
