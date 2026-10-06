/**
 * Behavioural proof for the certification evidence recorder.
 *
 * Opt-in and disposable-database only (it writes evidence rows then rolls its own
 * fixture back):
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres \
 *   CERTIFICATION_EVIDENCE_INTEGRATION=1 node --test scripts/__tests__/certification-evidence-recorder.integration.test.mjs
 *
 * Loopback only: this test mutates and cleans up real rows, so it refuses a remote
 * database. The parser guard rails are covered without a database by
 * certification-evidence-args.test.mjs.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const script = fileURLToPath(new URL("../record-rental-certification-evidence.mjs", import.meta.url));
const enabled = process.env.CERTIFICATION_EVIDENCE_INTEGRATION === "1";
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

function runRecorder(args) {
  return spawnSync(process.execPath, [script, `--database-url=${connectionString}`, ...args], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: connectionString },
  });
}

test(
  "recorder guards, records, is idempotent, and cleans up",
  { skip: !allowed ? "opt-in: CERTIFICATION_EVIDENCE_INTEGRATION=1 on a loopback DATABASE_URL" : false },
  async () => {
    const client = new Client({ connectionString });
    await client.connect();
    const { rows } = await client.query(
      "select a.id, a.freshness_status, a.last_checked_at, a.images from public.apartments a where a.metadata->>'is_test_fixture' is null and not exists (select 1 from public.property_verifications pv where pv.apartment_id = a.id) order by a.created_at asc limit 1",
    );
    if (rows.length === 0) {
      await client.end();
      throw new Error("integration DB needs at least one non-fixture apartment");
    }
    const apt = rows[0];
    const checkedAt = new Date().toISOString();
    const verifiedBy = "750e8400-e29b-41d4-a716-446655440099";
    // property_verifications.verified_by references auth.users(id); seed a dedicated
    // local user so the verification insert is exercised, and only remove our own.
    const seed = await client.query(
      "insert into auth.users (id, instance_id, aud, role, email) values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san468-integration@example.com') on conflict (id) do nothing returning id",
      [verifiedBy],
    );
    const seededAuthUser = (seed.rowCount ?? 0) === 1;
    const baseArgs = [
      `--apartment-id=${apt.id}`,
      `--checked-at=${checkedAt}`,
      "--freshness-status=active",
      "--confirm-write=true",
      `--image-url=https://example.com/san468-integration-${Date.now()}.jpg`,
      "--source-type=integration_test",
      "--source-url=https://example.com/san468-integration",
      "--verification-status=verified",
      `--verified-by=${verifiedBy}`,
      "--notes=san468 integration",
    ];
    try {
      // 1. Parser guard: verification needs a verifier.
      const noVerifier = runRecorder(baseArgs.filter((a) => !a.startsWith("--verified-by")));
      assert.equal(noVerifier.status, 2, noVerifier.stderr);
      assert.match(noVerifier.stderr, /verified-by/);

      // 2. Behavioural guard: a test fixture is refused.
      await client.query(
        `update public.apartments set metadata = coalesce(metadata, '{}'::jsonb) || '{"is_test_fixture": true}'::jsonb where id = $1`,
        [apt.id],
      );
      const fixture = runRecorder(baseArgs);
      assert.equal(fixture.status, 1, fixture.stderr);
      assert.match(fixture.stderr, /is_test_fixture/);
      await client.query(`update public.apartments set metadata = metadata - 'is_test_fixture' where id = $1`, [apt.id]);

      // 3. First real write succeeds.
      const first = runRecorder(baseArgs);
      assert.equal(first.status, 0, first.stderr);
      assert.match(first.stdout, /freshness_log\+1/);
      assert.match(first.stdout, /grounding\+1/);
      assert.match(first.stdout, /verification\+1/);
      assert.match(first.stdout, /image\+1/);

      // 4. Re-running the same evidence is a no-op.
      const second = runRecorder(baseArgs);
      assert.equal(second.status, 0, second.stderr);
      assert.match(second.stdout, /freshness_log\+0/);
      assert.match(second.stdout, /grounding\+0/);
      assert.match(second.stdout, /verification\+0/);
      assert.match(second.stdout, /image\+0/);

      // 5. Same timestamp, different freshness status → conflict, not silence.
      const freshnessConflict = runRecorder(
        baseArgs.map((a) => (a.startsWith("--freshness-status") ? "--freshness-status=stale" : a)),
      );
      assert.equal(freshnessConflict.status, 1, freshnessConflict.stderr);
      assert.match(freshnessConflict.stderr, /already records "active"/i);

      // 6. Changed verification evidence → conflict, not a silent skip.
      const verificationConflict = runRecorder(
        baseArgs.map((a) => (a.startsWith("--verification-status") ? "--verification-status=rejected" : a)),
      );
      assert.equal(verificationConflict.status, 1, verificationConflict.stderr);
      assert.match(verificationConflict.stderr, /already has a "verified" verification/i);
    } finally {
      await client.query("delete from public.rental_freshness_log where listing_id = $1 and checked_at = $2::timestamptz", [apt.id, checkedAt]);
      await client.query("delete from public.rental_grounding where apartment_id = $1 and checked_at = $2::timestamptz", [apt.id, checkedAt]);
      await client.query("delete from public.property_verifications where apartment_id = $1 and verified_at = $2::timestamptz", [apt.id, checkedAt]);
      await client.query(
        "update public.apartments set freshness_status = $2, last_checked_at = $3, images = $4 where id = $1",
        [apt.id, apt.freshness_status, apt.last_checked_at, apt.images],
      );
      const { rows: left } = await client.query(
        "select (select count(*) from public.rental_freshness_log where listing_id = $1 and checked_at = $2::timestamptz) + (select count(*) from public.rental_grounding where apartment_id = $1 and checked_at = $2::timestamptz) + (select count(*) from public.property_verifications where apartment_id = $1 and verified_at = $2::timestamptz) as n",
        [apt.id, checkedAt],
      );
      assert.equal(Number(left[0].n), 0, "integration rows must be cleaned up");
      if (seededAuthUser) {
        await client.query("delete from auth.users where id = $1", [verifiedBy]);
      }
      await client.end();
    }
  },
);
