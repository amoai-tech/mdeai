import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const dbUrl = process.env.SUPABASE_DB_URL;
const integration = dbUrl ? describe : describe.skip;

/**
 * SAN-814 — two independent authenticated Postgres sessions update different
 * profile fields. The row-locked JSONB merge must preserve both.
 *
 * This is a local-database integration test. It is skipped when no local
 * SUPABASE_DB_URL is supplied; CI's pgTAP suite covers the sequential contract.
 */
integration("partner_profile_patch concurrency", () => {
  it("preserves both fields when two sessions merge different keys", async () => {
    const userId = randomUUID();
    const partnerId = randomUUID();
    const email = `san814-concurrency-${userId}@example.test`;
    const admin = new Client({ connectionString: dbUrl });
    const a = new Client({ connectionString: dbUrl });
    const b = new Client({ connectionString: dbUrl });

    try {
      await admin.connect();
      await admin.query(
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
           email_confirmed_at, created_at, updated_at)
         values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           $2, extensions.crypt('san814-fixture', extensions.gen_salt('bf')), now(), now(), now())`,
        [userId, email],
      );
      await admin.query(
        `insert into public.profiles (id, email) values ($1, $2)
         on conflict (id) do nothing`,
        [userId, email],
      );
      await admin.query(
        `insert into public.partners (id, profile_id, type, status, settings)
         values ($1, $2, 'venue', 'draft',
           '{"businessName":"Café A","description":"Old","website":"https://old.example"}'::jsonb)`,
        [partnerId, userId],
      );
      await admin.query(
        `insert into public.partner_members (partner_id, profile_id, role)
         values ($1, $2, 'owner')`,
        [partnerId, userId],
      );

      await a.connect();
      await b.connect();
      for (const client of [a, b]) {
        await client.query("begin");
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      }

      const description = a.query(
        `select public.partner_profile_patch($1::jsonb, $2::uuid)`,
        [JSON.stringify({ description: "Concurrent description" }), partnerId],
      );
      // Let the first transaction acquire the partner row lock before starting the second.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const website = b.query(
        `select public.partner_profile_patch($1::jsonb, $2::uuid)`,
        [JSON.stringify({ website: "https://concurrent.example" }), partnerId],
      );

      await description;
      await a.query("commit");
      await website;
      await b.query("commit");

      const { rows } = await admin.query(
        `select settings->>'description' as description,
                settings->>'website' as website,
                settings->>'businessName' as business_name
         from public.partners where id = $1`,
        [partnerId],
      );
      expect(rows[0]).toEqual({
        description: "Concurrent description",
        website: "https://concurrent.example",
        business_name: "Café A",
      });
    } finally {
      await Promise.allSettled([a.end(), b.end()]);
      await admin.query("delete from public.partner_members where partner_id = $1", [partnerId]).catch(() => {});
      await admin.query("delete from public.partners where id = $1", [partnerId]).catch(() => {});
      await admin.query("delete from public.profiles where id = $1", [userId]).catch(() => {});
      await admin.query("delete from auth.users where id = $1", [userId]).catch(() => {});
      await admin.end().catch(() => {});
    }
    // Seven setup queries plus two row-locked transactions routinely take 4–5s
    // on a busy local database. The default 5s budget measured scheduling, not
    // the merge; 15s keeps the same concurrent-write assertion without a retry.
  }, 15_000);
});
