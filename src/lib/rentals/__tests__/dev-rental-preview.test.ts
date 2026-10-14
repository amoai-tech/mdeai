import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The preview reads the private partner-assets bucket with the server-only service
// client. Mock that client so no credential or network is needed. The mock derives
// bytes from the *requested object path*, so a canned response that ignores the
// requested photo is detected instead of passing.
const h = vi.hoisted(() => {
  const bytesFor = (objectPath: string) => new TextEncoder().encode(`WEBP:${objectPath}`);
  const defaultImages = [0, 1, 2, 3].map((sort_order) => ({
    sort_order,
    storage_path: `partner-assets/source-review/fincaraiz/apt-1/${sort_order + 1}-hash.webp`,
    mime_type: "image/webp",
  }));
  const state = {
    available: true,
    apartmentId: "apt-1",
    images: defaultImages,
    apartment: {
      available_from: null as string | null,
      latitude: null as number | null,
      longitude: null as number | null,
      metadata: {} as Record<string, unknown>,
    },
  };
  return {
    bytesFor,
    defaultImages,
    state,
    download: vi.fn(
      async (objectPath: string): Promise<{ data: Blob | null; error: unknown }> => ({
        data: new Blob([bytesFor(objectPath)]),
        error: null,
      }),
    ),
    knownSlug: "candidate-fincaraiz-193916988",
  };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => {
    if (!h.state.available) return null;
    return {
      from: (table: string) => {
        if (table === "apartments") {
          return {
            select: () => ({
              eq: (_column: string, value: string) => ({
                maybeSingle: async () => ({
                  data: value === h.knownSlug ? { id: h.state.apartmentId, ...h.state.apartment } : null,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({ order: async () => ({ data: h.state.images, error: null }) }),
          }),
        };
      },
      storage: { from: () => ({ download: h.download }) },
    };
  },
}));

import {
  getLocalPreviewDetail,
  getLocalPreviewPhoto,
  getLocalPreviewRentals,
  isLocalPreviewHost,
  isLocalPreviewRequest,
  isLocalRentalPreviewEnabled,
  resetLocalPreviewImageCache,
} from "@/lib/rentals/dev-rental-preview";

const headerLookup = (values: Record<string, string>) => ({
  get: (name: string) => values[name] ?? null,
});

const candidate = {
  slug: "candidate-fincaraiz-193916988",
  title: "Furnished Conquistadores Test Candidate",
  neighborhood: "Conquistadores",
  address: "Advertised test address",
  bedrooms: null,
  bathrooms: 1,
  size_sqm: 30,
  price_monthly: 2_100_000,
  currency: "COP",
  description: "Source claim, not verified",
  amenities: ["internet"],
  building_amenities: [],
  source_url: "https://www.fincaraiz.com.co/apartaestudio-en-arriendo-en-conquistadores-medellin/193916988",
};

const photoUrl = (sortOrder: number) =>
  `/api/dev/rental-photo/${candidate.slug}/photo-0${sortOrder + 1}.webp`;
const objectPath = (index: number) => `source-review/fincaraiz/apt-1/${index + 1}-hash.webp`;

let root: string;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "mde-rental-preview-"));
  await writeFile(path.join(root, "supabase_draft_records.json"), JSON.stringify([candidate]));
  vi.stubEnv("MDE_DEV_RENTAL_FIXTURES_DIR", root);
  vi.stubEnv("MDE_DEV_RENTAL_PREVIEW", "1");
  vi.stubEnv("NODE_ENV", "development");
  h.state.available = true;
  h.state.apartmentId = "apt-1";
  h.state.images = h.defaultImages;
  h.state.apartment = { available_from: null, latitude: null, longitude: null, metadata: {} };
  h.download.mockClear();
  resetLocalPreviewImageCache();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  warnSpy.mockRestore();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("local rental preview (no publishing bypass)", () => {
  it("requires both development runtime and an explicit opt-in", async () => {
    expect(isLocalRentalPreviewEnabled("development", "1")).toBe(true);
    expect(isLocalRentalPreviewEnabled("production", "1")).toBe(false);
    expect(isLocalRentalPreviewEnabled("test", "1")).toBe(false);
    expect(isLocalRentalPreviewEnabled("development", "0")).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(await getLocalPreviewRentals()).toEqual([]);
    expect(await getLocalPreviewDetail(candidate.slug)).toBeNull();
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-01.webp")).toBeNull();
    expect(h.download).not.toHaveBeenCalled();
  });

  it("only serves the preview to localhost hosts", () => {
    expect(isLocalPreviewHost("127.0.0.1:3016")).toBe(true);
    expect(isLocalPreviewHost("localhost:3001")).toBe(true);
    expect(isLocalPreviewHost("[::1]:3016")).toBe(true);
    expect(isLocalPreviewHost("dev.example.com")).toBe(false);
    expect(isLocalPreviewHost("192.168.1.10:3016")).toBe(false);
    expect(isLocalPreviewHost("0.0.0.0:3016")).toBe(false);
    expect(isLocalPreviewHost("")).toBe(false);
    expect(isLocalPreviewHost(null)).toBe(false);
    expect(isLocalPreviewHost(undefined)).toBe(false);
  });

  it("refuses a request that arrived through a proxy or tunnel", () => {
    expect(isLocalPreviewRequest("127.0.0.1:3016", headerLookup({}))).toBe(true);
    // Next dev itself fills x-forwarded-* with the loopback peer, so these must pass.
    expect(isLocalPreviewRequest("127.0.0.1:3016", headerLookup({ "x-forwarded-for": "127.0.0.1" }))).toBe(true);
    expect(isLocalPreviewRequest("127.0.0.1:3016", headerLookup({ "x-forwarded-host": "127.0.0.1:3016" }))).toBe(true);
    // A tunnel can keep a local-looking Host but forwards the real client address.
    expect(isLocalPreviewRequest("127.0.0.1:3016", headerLookup({ "x-forwarded-for": "203.0.113.9" }))).toBe(false);
    expect(isLocalPreviewRequest("127.0.0.1:3016", headerLookup({ "x-forwarded-for": "203.0.113.9, 127.0.0.1" }))).toBe(false);
    expect(isLocalPreviewRequest("127.0.0.1:3016", headerLookup({ "x-forwarded-host": "preview.example.com" }))).toBe(false);
    expect(isLocalPreviewRequest("127.0.0.1:3016", headerLookup({ "x-real-ip": "203.0.113.9" }))).toBe(false);
    expect(isLocalPreviewRequest("127.0.0.1:3016", headerLookup({ "cf-connecting-ip": "203.0.113.9" }))).toBe(false);
    expect(isLocalPreviewRequest("127.0.0.1:3016", headerLookup({ "cf-ray": "8a1b2c3d4e5f6a7b-SJC" }))).toBe(false);
    expect(isLocalPreviewRequest("127.0.0.1:3016", headerLookup({ forwarded: "for=203.0.113.9" }))).toBe(false);
    // A non-local Host is refused with or without forwarding headers.
    expect(isLocalPreviewRequest("evil.example.com", headerLookup({}))).toBe(false);
  });

  it("shows the source price and all four Storage photos without claiming availability or a map pin", async () => {
    const rentals = await getLocalPreviewRentals();
    expect(rentals).toHaveLength(1);
    expect(rentals[0]).toMatchObject({
      id: candidate.slug,
      currency: "COP",
      price_monthly: 2100000,
      // No invented nightly rent, and an unknown bedroom count stays null (not a "Studio").
      nightly_price: 0,
      bedrooms: null,
      image: photoUrl(0),
      can_schedule_viewing: false,
      schedule_viewing_url: null,
      tags: ["dev-preview"],
    });
    expect(rentals[0].availability).toBe("Availability unconfirmed · Development preview");
    expect(rentals[0].latitude).toBeUndefined();
    expect(rentals[0].longitude).toBeUndefined();

    const detail = await getLocalPreviewDetail(candidate.slug);
    expect(detail).toMatchObject({
      priceNightly: null,
      priceMonthly: 2100000,
      canScheduleViewing: false,
      latitude: null,
      longitude: null,
      status: "development-preview",
      images: [photoUrl(0), photoUrl(1), photoUrl(2), photoUrl(3)],
    });
  });

  it("shows user-attested Supabase availability and Google rooftop map pins only with receipts", async () => {
    h.state.apartment = {
      available_from: "2026-10-14",
      latitude: 6.2422222,
      longitude: -75.5864818,
      metadata: {
        development_availability_attestation: { available_from: "2026-10-14" },
        map_geocoding: { provider: "google_geocoding_api", location_type: "ROOFTOP" },
      },
    };
    resetLocalPreviewImageCache();
    const [rental] = await getLocalPreviewRentals();
    expect(rental.availability).toBe("Available from 2026-10-14 (user-reported) · Development preview");
    expect(rental.latitude).toBe(6.2422222);
    expect(rental.longitude).toBe(-75.5864818);
    expect(rental.can_schedule_viewing).toBe(false);
    const detail = await getLocalPreviewDetail(candidate.slug);
    expect(detail).toMatchObject({
      availableFrom: "2026-10-14",
      latitude: 6.2422222,
      longitude: -75.5864818,
      canScheduleViewing: false,
    });

    // A street-interpolated coordinate is not evidence of a real building pin.
    h.state.apartment.metadata = {
      development_availability_attestation: { available_from: "2026-10-14" },
      map_geocoding: { provider: "google_geocoding_api", location_type: "RANGE_INTERPOLATED" },
    };
    resetLocalPreviewImageCache();
    const [approximate] = await getLocalPreviewRentals();
    expect(approximate.latitude).toBeUndefined();
    expect(approximate.longitude).toBeUndefined();
    expect((await getLocalPreviewDetail(candidate.slug))?.latitude).toBeNull();

    // Unknown availability remains unknown even when a date appears in a stale record.
    h.state.apartment.metadata = {};
    resetLocalPreviewImageCache();
    const [unconfirmed] = await getLocalPreviewRentals();
    expect(unconfirmed.availability).toBe("Availability unconfirmed · Development preview");
  });

  it("addresses photos by explicit sort_order, not array position", async () => {
    h.state.images = [
      { sort_order: 0, storage_path: "partner-assets/source-review/fincaraiz/apt-1/1-a.webp", mime_type: "image/webp" },
      { sort_order: 2, storage_path: "partner-assets/source-review/fincaraiz/apt-1/3-c.webp", mime_type: "image/webp" },
    ];
    resetLocalPreviewImageCache();

    const detail = await getLocalPreviewDetail(candidate.slug);
    expect(detail?.images).toEqual([photoUrl(0), photoUrl(2)]);
    // The sort_order gap is a real missing photo, not the next array element.
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-02.webp")).toBeNull();
    const third = await getLocalPreviewPhoto(candidate.slug, "photo-03.webp");
    expect(Buffer.from(third?.bytes ?? new ArrayBuffer(0))).toEqual(
      Buffer.from(h.bytesFor("source-review/fincaraiz/apt-1/3-c.webp")),
    );
  });

  it("streams each photo from its own object path", async () => {
    const first = await getLocalPreviewPhoto(candidate.slug, "photo-01.webp");
    const second = await getLocalPreviewPhoto(candidate.slug, "photo-02.webp");
    if (!first || !second) throw new Error("expected both photos to resolve");

    expect(first.contentType).toBe("image/webp");
    expect(Buffer.from(first.bytes)).toEqual(Buffer.from(h.bytesFor(objectPath(0))));
    expect(Buffer.from(second.bytes)).toEqual(Buffer.from(h.bytesFor(objectPath(1))));
    expect(Buffer.from(first.bytes)).not.toEqual(Buffer.from(second.bytes));
    expect(h.download).toHaveBeenNthCalledWith(1, objectPath(0));
    expect(h.download).toHaveBeenNthCalledWith(2, objectPath(1));
  });

  it("refuses storage rows outside the apartment's allowlisted prefix or with an unsafe basename", async () => {
    h.state.images = [
      { sort_order: 0, storage_path: "partner-assets/source-review/other/apt-1/1-a.webp", mime_type: "image/webp" },
    ];
    resetLocalPreviewImageCache();
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-01.webp")).toBeNull();
    expect(h.download).not.toHaveBeenCalled();

    h.state.images = [
      { sort_order: 0, storage_path: "partner-assets/source-review/fincaraiz/apt-1/..%2Fsecret.webp", mime_type: "image/webp" },
    ];
    resetLocalPreviewImageCache();
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-01.webp")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("degrades safely and visibly when Storage credentials are missing", async () => {
    h.state.available = false;
    resetLocalPreviewImageCache();
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-01.webp")).toBeNull();
    const [rental] = await getLocalPreviewRentals();
    expect(rental.image).toBe("");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("service-role client unavailable"));
  });

  it("rejects unknown slugs, filenames and positions", async () => {
    expect(await getLocalPreviewPhoto(candidate.slug, "../.env")).toBeNull();
    expect(await getLocalPreviewPhoto("../../etc", "photo-01.webp")).toBeNull();
    expect(await getLocalPreviewPhoto("candidate-fincaraiz-999999999", "photo-01.webp")).toBeNull();
    expect(await getLocalPreviewPhoto("candidate-fincaraiz-12345", "photo-01.webp")).toBeNull();
    expect(await getLocalPreviewPhoto("candidate-fincaraiz-1234567890123", "photo-01.webp")).toBeNull();
    expect(await getLocalPreviewPhoto("candidate-fincaraiz-123456X", "photo-01.webp")).toBeNull();
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-05.webp")).toBeNull();
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-0x.webp")).toBeNull();
  });

  it("returns no bytes when Storage errors", async () => {
    h.download.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-01.webp")).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("storage download failed"));
  });

  it("accepts original verified source URL on aggregator records", async () => {
    await writeFile(path.join(root, "supabase_draft_records.json"), JSON.stringify([{
      ...candidate,
      source_url: "https://co.inmuebles.eu.org/propiedad/1682893-apartaestudio-en-arriendo-en-conquistadores-medellin",
      metadata: { original_listing_url: candidate.source_url },
    }]));
    const [rental] = await getLocalPreviewRentals();
    expect(rental.source_url).toBe(candidate.source_url);
    expect(rental.can_schedule_viewing).toBe(false);
  });

  it("rejects malformed fixture records (slug, amenities, building_amenities)", async () => {
    for (const bad of [
      { ...candidate, slug: "../../outside" },
      { ...candidate, amenities: "internet" },
      { ...candidate, building_amenities: [1, 2] },
    ]) {
      await writeFile(path.join(root, "supabase_draft_records.json"), JSON.stringify([bad]));
      await expect(getLocalPreviewRentals()).rejects.toThrow("missing or invalid");
    }
  });
});
