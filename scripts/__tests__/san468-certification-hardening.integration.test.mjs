/**
 * SAN-468 — behavioural proof that the launch-ready certification cannot false-green.
 *
 * Opt-in and disposable-database only. It runs inside one transaction and rolls back,
 * so nothing it creates survives:
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres \
 *   SAN468_CERTIFICATION_INTEGRATION=1 \
 *   node --test scripts/__tests__/san468-certification-hardening.integration.test.mjs
 *
 * Loopback only: refuse a remote database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const reportSql = readFileSync(
  fileURLToPath(new URL("../sql/san468-inventory-quality-report.sql", import.meta.url)),
  "utf8",
);
const enabled = process.env.SAN468_CERTIFICATION_INTEGRATION === "1";
const connectionString = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "").trim();

function isLoopback(url) {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}
const allowed = enabled && Boolean(connectionString) && isLoopback(connectionString);

const LANDS = {
  verified: "f4680000-0000-4000-8000-0000000000a1",
  pending: "f4680000-0000-4000-8000-0000000000a2",
};
const ID = {
  positive: "f4680000-0000-4000-8000-0000000000b1",
  duplicate: "f4680000-0000-4000-8000-0000000000b2",
  noProperty: "f4680000-0000-4000-8000-0000000000b3",
  staleFreshness: "f4680000-0000-4000-8000-0000000000b4",
  oldFreshness: "f4680000-0000-4000-8000-0000000000b5",
  pendingOwner: "f4680000-0000-4000-8000-0000000000b6",
  rightsUnverified: "f4680000-0000-4000-8000-0000000000b7",
  notVerified: "f4680000-0000-4000-8000-0000000000b8",
  external: "f4680000-0000-4000-8000-0000000000b9",
  fixture: "f4680000-0000-4000-8000-0000000000ba",
  denormDrift: "f4680000-0000-4000-8000-0000000000bb",
};
const ADDRESS = "Calle Nunca 000, Medellín, Antioquia";

test(
  "launch-ready fails closed for every missing certification fact",
  { skip: !allowed ? "opt-in: SAN468_CERTIFICATION_INTEGRATION=1 on a loopback DATABASE_URL" : false },
  async () => {
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into auth.users (id, instance_id, aud, role, email)
         values ('f4680000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000',
                 'authenticated', 'authenticated', 'san468-cert-owner-a@example.com'),
                ('f4680000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000',
                 'authenticated', 'authenticated', 'san468-cert-owner-b@example.com')`,
      );
      await client.query(
        `insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
         values ($1, 'f4680000-0000-4000-8000-0000000000c1', 'SAN468 verified owner', 'approved', now()),
                ($2, 'f4680000-0000-4000-8000-0000000000c2', 'SAN468 pending owner', 'pending', null)`,
        [LANDS.verified, LANDS.pending],
      );

      const insertApartment = (id, slug, overrides = {}) =>
        client.query(
          `insert into public.apartments
             (id, title, slug, neighborhood, address, city, status, moderation_status,
              listing_workflow_status, landlord_id, verified, price_monthly, currency,
              available_from, latitude, longitude, metadata)
           values ($1, $2, $3, 'Laureles', $4, 'Medellín', $5, $6, $7, $8, $9, 2500000, 'COP',
                   current_date, $10, $11, $12)`,
          [
            id,
            overrides.title ?? "SAN468 certification row",
            slug,
            overrides.address ?? ADDRESS,
            overrides.status ?? "active",
            overrides.moderation ?? "approved",
            overrides.workflow ?? "published",
            overrides.landlord ?? LANDS.verified,
            overrides.verified ?? true,
            overrides.latitude ?? 6.2447,
            overrides.longitude ?? -75.5916,
            JSON.stringify(overrides.metadata ?? {}),
          ],
        );

      await insertApartment(ID.positive, "san468-cert-positive");
      await insertApartment(ID.duplicate, "san468-cert-duplicate");
      await insertApartment(ID.noProperty, "san468-cert-no-property");
      await insertApartment(ID.staleFreshness, "san468-cert-stale");
      await insertApartment(ID.oldFreshness, "san468-cert-old");
      await insertApartment(ID.pendingOwner, "san468-cert-pending-owner", { landlord: LANDS.pending });
      await insertApartment(ID.rightsUnverified, "san468-cert-rights");
      await insertApartment(ID.notVerified, "san468-cert-not-verified", { verified: false });
      await insertApartment(ID.external, "san468-cert-external", {
        metadata: { inventory_kind: "external_candidate", allowed_action: "view_original_listing" },
      });
      await insertApartment(ID.fixture, "san468-cert-fixture", {
        metadata: { is_test_fixture: true },
      });
      await insertApartment(ID.denormDrift, "san468-cert-denorm-drift");

      const withProperty = [
        ID.positive, ID.duplicate, ID.staleFreshness, ID.oldFreshness,
        ID.pendingOwner, ID.rightsUnverified, ID.notVerified, ID.denormDrift,
      ];
      for (const id of withProperty) {
        await client.query(
          `insert into public.property_verifications (apartment_id, status, verified_at, metadata)
           values ($1, 'verified', now(),
                   '{"owner_control":"verified","publish_permission":"granted","viewings_permission":"granted"}'::jsonb)`,
          [id],
        );
      }
      // noProperty gets only a pending verification.
      await client.query(
        `insert into public.property_verifications (apartment_id, status) values ($1, 'pending')`,
        [ID.noProperty],
      );

      const withRights = [ID.positive, ID.duplicate, ID.staleFreshness, ID.oldFreshness, ID.pendingOwner, ID.notVerified, ID.denormDrift];
      for (const id of withRights) {
        await client.query(
          `insert into public.rental_listing_images (listing_id, storage_path, source_url, mime_type, rights_status)
           values ($1, 'san468/cert.jpg', 'https://example.com/san468-cert.jpg', 'image/jpeg', 'authorized')`,
          [id],
        );
      }
      await client.query(
        `insert into public.rental_listing_images (listing_id, storage_path, source_url, mime_type, rights_status)
         values ($1, 'san468/cert.jpg', 'https://example.com/san468-cert.jpg', 'image/jpeg', 'unverified')`,
        [ID.rightsUnverified],
      );

      const fresh = [ID.positive, ID.duplicate, ID.pendingOwner, ID.rightsUnverified, ID.notVerified];
      for (const id of fresh) {
        await client.query(
          `insert into public.rental_freshness_log (listing_id, checked_at, status)
           values ($1, now(), 'active')`,
          [id],
        );
      }
      await client.query(
        `insert into public.rental_freshness_log (listing_id, checked_at, status)
         values ($1, now(), 'stale')`,
        [ID.staleFreshness],
      );
      await client.query(
        `insert into public.rental_freshness_log (listing_id, checked_at, status)
         values ($1, now() - interval '40 days', 'active')`,
        [ID.oldFreshness],
      );
      // Fresh denormalized fields with a stale canonical log: the log must win.
      await client.query(
        `update public.apartments set freshness_status = 'active', last_checked_at = now() where id = $1`,
        [ID.denormDrift],
      );
      await client.query(
        `insert into public.rental_freshness_log (listing_id, checked_at, status)
         values ($1, now(), 'stale')`,
        [ID.denormDrift],
      );

      const { rows } = await client.query(reportSql);
      const report = rows[0].report;
      const byId = new Map(report.rows.map((r) => [r.id, r]));
      const row = (id) => byId.get(id);

      // Positive control: everything present certifies.
      assert.equal(row(ID.positive).launch_ready, true, "positive control must be launch-ready");
      assert.equal(row(ID.positive).has_verified_owner, true);
      assert.equal(row(ID.positive).has_verified_property, true);
      assert.equal(row(ID.positive).has_current_freshness, true);
      assert.equal(row(ID.positive).has_authorized_photo, true);
      assert.equal(row(ID.positive).publicly_eligible, true);

      // Every negative case must fail, for its own reason.
      assert.equal(row(ID.noProperty).launch_ready, false, "missing verified property must fail");
      assert.equal(row(ID.noProperty).has_verified_property, false);
      assert.equal(row(ID.staleFreshness).launch_ready, false, "stale freshness must fail");
      assert.equal(row(ID.staleFreshness).has_current_freshness, false);
      assert.equal(row(ID.oldFreshness).launch_ready, false, "freshness outside the window must fail");
      assert.equal(row(ID.oldFreshness).has_current_freshness, false);
      assert.equal(row(ID.pendingOwner).launch_ready, false, "unverified owner must fail");
      assert.equal(row(ID.pendingOwner).has_verified_owner, false);
      assert.equal(row(ID.rightsUnverified).launch_ready, false, "photo without rights must fail");
      assert.equal(row(ID.rightsUnverified).has_authorized_photo, false);
      assert.equal(row(ID.rightsUnverified).has_any_image, true, "the image exists but is not authorized");
      assert.equal(row(ID.notVerified).launch_ready, false, "unverified listing must fail");
      assert.equal(
        row(ID.denormDrift).launch_ready,
        false,
        "fresh denormalized fields must not override a stale canonical freshness log",
      );
      assert.equal(row(ID.denormDrift).has_current_freshness, false);
      assert.equal(row(ID.denormDrift).has_freshness_denorm_drift, true);
      assert.equal(row(ID.external).publicly_eligible, false, "external candidate must not be public");
      assert.equal(row(ID.external).launch_ready, false);
      assert.equal(row(ID.fixture).publicly_eligible, false, "test fixture must not be public");
      assert.equal(row(ID.fixture).launch_ready, false);

      // Duplicate rows for the same physical property count once.
      assert.equal(row(ID.duplicate).launch_ready, true);
      assert.equal(row(ID.duplicate).canonical_key, row(ID.positive).canonical_key);
      const canonicalCount = [ID.positive, ID.duplicate].filter(
        (id) => row(id).is_canonical_launch_ready,
      ).length;
      assert.equal(canonicalCount, 1, "only one row per physical property is canonical launch-ready");
      assert.ok(
        Number(report.counts.launch_ready) >= 2,
        "both duplicate rows appear in the raw launch_ready count",
      );
      assert.ok(
        Number(report.counts.launch_ready_distinct) < Number(report.counts.launch_ready),
        "distinct property count must collapse duplicate rows",
      );
      assert.ok(Number(report.counts.duplicate_launch_ready_rows) >= 1);
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);
