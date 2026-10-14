import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The preview reads the private partner-assets bucket with the server-only service
// client. Mock that client so no credential or network is needed, and so the test
// can prove the URL/order behaviour without touching real Storage.
const h = vi.hoisted(() => {
  const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
  const images = [0, 1, 2, 3].map((sort_order) => ({
    sort_order,
    storage_path: `partner-assets/source-review/fincaraiz/apt-1/${sort_order + 1}-hash.webp`,
    mime_type: "image/webp",
  }));
  return {
    bytes,
    images,
    download: vi.fn(
      async (): Promise<{ data: Blob | null; error: unknown }> => ({
        data: new Blob([bytes]),
        error: null,
      }),
    ),
    knownSlug: "candidate-fincaraiz-193916988",
  };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "apartments") {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: async () => ({
                data: value === h.knownSlug ? { id: "apt-1" } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: h.images, error: null }),
          }),
        }),
      };
    },
    storage: { from: () => ({ download: h.download }) },
  }),
}));

import {
  getLocalPreviewDetail,
  getLocalPreviewPhoto,
  getLocalPreviewRentals,
  isLocalRentalPreviewEnabled,
} from "@/lib/rentals/dev-rental-preview";

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

const photoUrl = (index: number) =>
  `/api/dev/rental-photo/${candidate.slug}/photo-0${index + 1}.webp`;

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "mde-rental-preview-"));
  await writeFile(path.join(root, "supabase_draft_records.json"), JSON.stringify([candidate]));
  vi.stubEnv("MDE_DEV_RENTAL_FIXTURES_DIR", root);
  vi.stubEnv("MDE_DEV_RENTAL_PREVIEW", "1");
  vi.stubEnv("NODE_ENV", "development");
  h.download.mockClear();
  h.download.mockResolvedValue({ data: new Blob([h.bytes]), error: null });
});

afterEach(async () => {
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

  it("shows the source price and all four Storage photos without claiming viewing rights, availability or a map pin", async () => {
    const rentals = await getLocalPreviewRentals();
    expect(rentals).toHaveLength(1);
    expect(rentals[0]).toMatchObject({
      id: candidate.slug,
      currency: "COP",
      price_monthly: 2100000,
      image: photoUrl(0),
      can_schedule_viewing: false,
      schedule_viewing_url: null,
      tags: ["dev-preview"],
    });
    expect(rentals[0].availability).toMatch(/unconfirmed/i);
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

  it("streams the ordered photo bytes and rejects unknown slugs, filenames and positions", async () => {
    const photo = await getLocalPreviewPhoto(candidate.slug, "photo-01.webp");
    expect(photo?.contentType).toBe("image/webp");
    expect(Buffer.from(photo?.bytes ?? new ArrayBuffer(0))).toEqual(Buffer.from(h.bytes));

    expect(await getLocalPreviewPhoto(candidate.slug, "../.env")).toBeNull();
    expect(await getLocalPreviewPhoto("../../etc", "photo-01.webp")).toBeNull();
    expect(await getLocalPreviewPhoto("candidate-fincaraiz-999999999", "photo-01.webp")).toBeNull();
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-05.webp")).toBeNull();
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-0x.webp")).toBeNull();
  });

  it("returns no URL for a missing Storage object and no bytes when Storage errors", async () => {
    h.download.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-01.webp")).toBeNull();
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

  it("rejects malicious fixture records even in development", async () => {
    await writeFile(path.join(root, "supabase_draft_records.json"), JSON.stringify([
      { ...candidate, slug: "../../outside" },
    ]));
    await expect(getLocalPreviewRentals()).rejects.toThrow("missing or invalid");
  });
});
