#!/usr/bin/env node
/**
 * Read-only smoke check for the local CLI-managed Supabase embedding worker.
 * This is deliberately opt-in: CI and new worktrees have no local Vault secrets.
 * Never reads secret values, writes rows, or calls an external/hosted Supabase URL.
 *
 * Run: npm run test:local:embedding
 * Optional: SUPABASE_LOCAL_DB_CONTAINER=supabase_db_<project-id> npm run test:local:embedding
 */
import { execFileSync } from 'node:child_process';

const run = (binary, args) =>
  execFileSync(binary, args, { encoding: 'utf8', timeout: 12_000 }).trim();

export function assessEmbeddingReadiness({
  edgeRunning, restartPolicy, functionHttpStatus, projectUrlConfigured, cronSecretConfigured,
  pending, lastCronStatus, lastCronAgeSeconds,
}) {
  const problems = [];
  if (!edgeRunning) problems.push('Local Supabase Edge Runtime is not running');
  if (edgeRunning && restartPolicy !== 'unless-stopped')
    problems.push('Edge Runtime will not automatically restart after a reboot');
  if (functionHttpStatus !== 405) problems.push(
    `Worker GET returned HTTP ${functionHttpStatus ?? 'unreachable'}, expected 405 from its POST-only handler`,
  );
  if (!projectUrlConfigured) problems.push('Local Vault project_url is missing');
  if (!cronSecretConfigured) problems.push('Local Vault embedding_cron_secret is missing');
  if (pending > 0 && lastCronStatus !== 'succeeded')
    problems.push(`Embedding queue has ${pending} pending jobs but the latest cron run is ${lastCronStatus ?? 'missing'}`);
  if (pending > 0 && (lastCronAgeSeconds === null || lastCronAgeSeconds > 180))
    problems.push('Embedding cron has not run recently despite pending work');
  return problems;
}

async function main() {
  const names = run('docker', ['ps', '--format', '{{.Names}}']).split('\n');
  const configured = process.env.SUPABASE_LOCAL_DB_CONTAINER;
  const candidates = names.filter((n) => /^supabase_db_/.test(n) && (!configured || n === configured));
  if (candidates.length !== 1) throw new Error(
    `Expected exactly one local Supabase DB; found ${candidates.length}. Set SUPABASE_LOCAL_DB_CONTAINER.`,
  );
  const database = candidates[0];
  const suffix = database.slice('supabase_db_'.length);
  const edge = `supabase_edge_runtime_${suffix}`;
  const kong = `supabase_kong_${suffix}`;
  const edgeRunning = names.includes(edge);
  const restartPolicy = edgeRunning ? run('docker', ['inspect', '-f', '{{.HostConfig.RestartPolicy.Name}}', edge]) : null;
  const bindings = run('docker', ['port', kong, '8000/tcp']);
  const ipv4 = bindings.split('\n').find((s) => /^0\.0\.0\.0:|^127\.0\.0\.1:/.test(s));
  if (!ipv4) throw new Error('Could not find local HTTP port for Supabase Kong');
  const port = Number(ipv4.match(/:(\d+)$/)?.[1]);
  if (!Number.isSafeInteger(port)) throw new Error('Invalid local Supabase port');

  // GET is never allowed to claim work: the worker must reply with HTTP 405.
  let functionHttpStatus = null;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/functions/v1/process-embedding-jobs`, {
      method: 'GET', signal: AbortSignal.timeout(5_000),
    });
    functionHttpStatus = response.status;
  } catch { /* the summary below reports the unreachable worker */ }

  const sql = `BEGIN READ ONLY;
    SELECT
      EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url' AND length(decrypted_secret) > 0),
      EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name = 'embedding_cron_secret' AND length(decrypted_secret) > 0),
      (SELECT count(*) FROM public.embedding_jobs WHERE status = 'pending'),
      (SELECT status FROM cron.job_run_details WHERE jobid = (
        SELECT jobid FROM cron.job WHERE jobname = 'mdeai_embedding_jobs_tick'
       ) ORDER BY start_time DESC LIMIT 1),
      (SELECT extract(epoch FROM now() - start_time)::integer FROM cron.job_run_details
       WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'mdeai_embedding_jobs_tick')
       ORDER BY start_time DESC LIMIT 1);
    ROLLBACK;`;
  const lines = run('docker', ['exec', database, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', sql]).split('\n');
  const values = lines.find((line) => /^(t|f)\|(t|f)\|\d+\|/.test(line))?.split('|');
  if (!values) throw new Error('Could not read local scheduler status');

  const status = {
    edgeRunning,
    restartPolicy,
    functionHttpStatus,
    projectUrlConfigured: values[0] === 't',
    cronSecretConfigured: values[1] === 't',
    pending: Number(values[2]),
    lastCronStatus: values[3] || null,
    lastCronAgeSeconds: values[4] ? Number(values[4]) : null,
  };
  const problems = assessEmbeddingReadiness(status);
  console.log(`Local worker: ${problems.length ? 'FAIL' : 'PASS'}; pending=${status.pending}; edge=${edgeRunning ? 'up' : 'down'}; endpoint=${functionHttpStatus}; cron=${status.lastCronStatus ?? 'none'}`);
  for (const problem of problems) console.error(`FAIL: ${problem}`);
  if (problems.length) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('/check-local-embedding-readiness.mjs')) {
  main().catch((error) => {
    console.error(`Local embedding readiness: ${error.message}`);
    process.exitCode = 1;
  });
}
