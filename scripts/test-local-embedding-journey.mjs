/**
 * Opt-in real local apartment -> Gemini embedding -> existing pgvector hybrid search.
 * Requires a CLI-managed local Supabase Docker stack. Never uses hosted DB credentials.
 * Synthetic rows are deleted and cleanup is verified even when the journey fails.
 *
 * MDE_LOCAL_SUPABASE_WORKDIR=<matching Docker CLI workdir> node scripts/test-local-embedding-journey.mjs
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', timeout: 60_000, ...options }).trim();

const fixtureId = randomUUID();
const queryText = 'quiet apartment with desk balcony and WiFi for remote work in Laureles';
const workdir = resolve(process.env.MDE_LOCAL_SUPABASE_WORKDIR || process.cwd());
const envFile = resolve(workdir, 'supabase/functions/.env');

function localStack() {
  const containers = run('docker', ['ps', '--format', '{{.Names}}']).split('\n');
  const selected = process.env.SUPABASE_LOCAL_DB_CONTAINER;
  const databases = containers.filter((name) =>
    /^supabase_db_[a-zA-Z0-9_-]+$/.test(name) && (!selected || name === selected));
  if (databases.length !== 1) throw new Error('STOP: select exactly one local Supabase Docker DB');
  const db = databases[0];
  const suffix = db.slice('supabase_db_'.length);
  const labels = JSON.parse(run('docker', ['inspect', '--format', '{{json .Config.Labels}}', db]));
  if (labels['com.supabase.cli.project'] !== suffix || resolve(labels['com.supabase.cli.workdir'] || '/') !== workdir)
    throw new Error('STOP: selected DB is not the Supabase CLI stack for MDE_LOCAL_SUPABASE_WORKDIR');
  const kong = 'supabase_kong_' + suffix;
  if (!containers.includes(kong) || !containers.includes('supabase_edge_runtime_' + suffix))
    throw new Error('STOP: local Kong or Edge Runtime is not running');
  const binding = run('docker', ['port', kong, '8000/tcp']).split('\n')
    .find((line) => /^(127\.0\.0\.1|0\.0\.0\.0):\d+$/.test(line));
  const port = Number(binding?.split(':')[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('STOP: invalid local Kong port');
  return { db, port };
}

function readLocalCredentials() {
  const vars = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n')
    .filter((line) => /^\s*[A-Z_][A-Z_\d]*=/.test(line))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, '')];
    }));
  for (const name of ['GOOGLE_GENERATIVE_AI_API_KEY', 'EMBEDDING_CRON_SECRET']) {
    if (!vars[name]) throw new Error('STOP: missing local Edge Function credential ' + name);
  }
  return vars;
}

function sql(db, statement, variables = {}) {
  const args = ['exec', '-i', db, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-At', '-q', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(variables)) args.push('-v', name + '=' + value);
  return run('docker', args, { input: statement, timeout: 30_000 });
}

function postJson(transport, options, data) {
  return new Promise((resolvePromise, reject) => {
    const req = transport(options, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (part) => { data += part; if (data.length > 2_000_000) req.destroy(); });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error('Embedding endpoint returned HTTP ' + response.statusCode));
          return;
        }
        try { resolvePromise(JSON.parse(data)); } catch { reject(new Error('Invalid JSON from embedding endpoint')); }
      });
    });
    req.setTimeout(55_000, () => req.destroy(new Error('Embedding request timed out')));
    req.on('error', reject);
    req.end(JSON.stringify(data));
  });
}

async function main() {
  // Preflight before touching any table: only an exact Docker CLI workdir may be mutated.
  const { db, port } = localStack();
  const secrets = readLocalCredentials();
  let attemptedCreate = false;
  let failed = false;
  try {
    attemptedCreate = true; // Also clean up if the INSERT commits but the CLI call loses its response.
    sql(db, `BEGIN;
      INSERT INTO public.apartments (id,title,neighborhood,description,bedrooms,amenities,status)
      VALUES (:'fixture_id'::uuid, 'TEST ONLY - local MDE AI apartment', 'Laureles',
      'Synthetic example: quiet bright loft with desk, balcony, and reliable WiFi for remote work',
      1, ARRAY['WiFi', 'Desk', 'Balcony'], 'active');
      UPDATE public.embedding_jobs
      SET created_at=timestamp '2000-01-01', next_attempt_at=timestamp '2000-01-01'
      WHERE entity_type='apartment' AND entity_id=:'fixture_id'::uuid AND status='pending';
      COMMIT;`, { fixture_id: fixtureId });
    const count = Number(sql(db, `SELECT count(*) FROM public.embedding_jobs
      WHERE entity_id=:'fixture_id'::uuid AND status='pending';`, { fixture_id: fixtureId }));
    console.log('apartment_created=true queue_pending=' + count);
    if (count !== 1) throw new Error('Apartment did not enqueue exactly one job');

    let embedded = false;
    for (let attempt = 1; attempt <= 7; attempt++) {
      await postJson(httpRequest, {
        hostname: '127.0.0.1', port, path: '/functions/v1/process-embedding-jobs',
        method: 'POST', headers: {
          'content-type': 'application/json', 'x-cron-secret': secrets.EMBEDDING_CRON_SECRET,
        },
      }, { limit: 1 });
      const count = sql(db, `SELECT count(*) FROM public.listing_embeddings
        WHERE listing_id=:'fixture_id'::uuid;`, { fixture_id: fixtureId });
      console.log('worker_try=' + attempt + ' fixture_vector_stored=' + count);
      if (count === '1') { embedded = true; break; }
      await new Promise((done) => setTimeout(done, 1000));
    }
    if (!embedded) throw new Error('Fixture was not embedded after seven worker requests');
    const dimensions = sql(db, `SELECT model || ':' || extensions.vector_dims(embedding)
      FROM public.listing_embeddings WHERE listing_id=:'fixture_id'::uuid;`, { fixture_id: fixtureId });
    if (!dimensions.endsWith(':768')) throw new Error('Stored vector dimensions are not 768');
    console.log('stored_model_and_dimensions=' + dimensions);

    const embedding = await postJson(httpsRequest, {
      hostname: 'generativelanguage.googleapis.com', port: 443,
      path: '/v1beta/models/gemini-embedding-001:embedContent', method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': secrets.GOOGLE_GENERATIVE_AI_API_KEY },
    }, { model: 'models/gemini-embedding-001',
      content: { parts: [{ text: queryText }] }, outputDimensionality: 768 });
    const values = embedding?.embedding?.values;
    if (!Array.isArray(values) || values.length !== 768 || values.some((v) => !Number.isFinite(v)))
      throw new Error('Gemini query embedding must have 768 finite numbers');
    console.log('real_gemini_query_embedding=true dimensions=768');

    const vector = '[' + values.join(',') + ']';
    const match = sql(db, `SELECT id::text || ':' || round(similarity::numeric, 4)
      FROM public.hybrid_search_listings(:'query_text', :'query_vector'::extensions.vector, 50)
      WHERE id=:'fixture_id'::uuid;`, { query_text: queryText, query_vector: vector, fixture_id: fixtureId });
    if (!match) throw new Error('Hybrid AI search did not return test apartment');
    console.log('real_hybrid_search_match=true');
    console.log('FULL_JOURNEY_PASS=true');
  } catch (error) {
    failed = true;
    console.error('FULL_JOURNEY_FAIL=' + error.constructor.name + ': ' + error.message.slice(0, 160));
  } finally {
    if (attemptedCreate) {
      try {
        // Explicitly clear all fixture-owned records; the vector also has an ON DELETE CASCADE FK.
        sql(db, `BEGIN;
          DELETE FROM public.embedding_jobs WHERE entity_id=:'fixture_id'::uuid;
          DELETE FROM public.listing_embeddings WHERE listing_id=:'fixture_id'::uuid;
          DELETE FROM public.apartments WHERE id=:'fixture_id'::uuid;
          COMMIT;`, { fixture_id: fixtureId });
        const remaining = sql(db, `SELECT
          (SELECT count(*) FROM public.apartments WHERE id=:'fixture_id'::uuid)
          + (SELECT count(*) FROM public.listing_embeddings WHERE listing_id=:'fixture_id'::uuid)
          + (SELECT count(*) FROM public.embedding_jobs WHERE entity_id=:'fixture_id'::uuid);`,
        { fixture_id: fixtureId });
        console.log('fixture_rows_remaining=' + remaining);
        if (remaining !== '0') failed = true;
      } catch (error) {
        failed = true;
        console.error('FIXTURE_CLEANUP_FAILED=' + error.constructor.name);
      }
    }
    if (failed) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('STOP: local embedding test cannot start: ' + error.message.slice(0, 160));
  process.exitCode = 1;
});
