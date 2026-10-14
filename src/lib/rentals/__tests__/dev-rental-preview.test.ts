import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

let root: string;
const photo = Buffer.from("RIFFfake-webp-test-bytes");

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "mde-rental-preview-"));
  await mkdir(path.join(root, "photos", candidate.slug), { recursive: true });
  await writeFile(path.join(root, "supabase_draft_records.json"), JSON.stringify([candidate]));
  await writeFile(path.join(root, "photos", candidate.slug, "photo-01.webp"), photo);
  vi.stubEnv("MDE_DEV_RENTAL_FIXTURES_DIR", root);
  vi.stubEnv("MDE_DEV_RENTAL_PREVIEW", "1");
  vi.stubEnv("NODE_ENV", "development");
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
  });

  it("shows the source price and local image without claiming viewing rights, availability or map pin", async () => {
    const rentals = await getLocalPreviewRentals();
    expect(rentals).toHaveLength(1);
    expect(rentals[0]).toMatchObject({
      id: candidate.slug,
      currency: "COP",
      price_monthly: 2100000,
      image: `/api/dev/rental-photo/${candidate.slug}/photo-01.webp`,
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
      images: [`/api/dev/rental-photo/${candidate.slug}/photo-01.webp`],
    });
  });

  it("restricts photo paths and unit IDs; returns only known candidate files", async () => {
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-01.webp")).toEqual(photo);
    expect(await getLocalPreviewPhoto(candidate.slug, "../.env")).toBeNull();
    expect(await getLocalPreviewPhoto("../../etc", "photo-01.webp")).toBeNull();
    expect(await getLocalPreviewPhoto("candidate-fincaraiz-999999999", "photo-01.webp")).toBeNull();
    expect(await getLocalPreviewPhoto(candidate.slug, "photo-09.webp")).toBeNull();
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
