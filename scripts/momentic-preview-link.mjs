/** Short-lived deployment-scoped access for the trusted Momentic workflow.
 * Do not use the project-wide Vercel automation bypass on untrusted PR previews.
 */
import { appendFileSync } from 'node:fs';

const mode = process.argv[2];
const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
const apiKey = process.env.VERCEL_TOKEN;
const token = process.env.MOMENTIC_PREVIEW_SHARE_TOKEN;
const output = process.env.GITHUB_OUTPUT;

if (!['create', 'revoke'].includes(mode) || !deploymentId || !apiKey) {
  throw new Error('Usage: momentic-preview-link.mjs create|revoke with VERCEL_DEPLOYMENT_ID and VERCEL_TOKEN');
}
const endpoint = new URL(
  'https://api.vercel.com/aliases/' + encodeURIComponent(deploymentId) + '/protection-bypass',
);
endpoint.searchParams.set('slug', 'amo-agency');

const payload = mode === 'create'
  ? { ttl: 1800 }
  : { revoke: { secret: token, regenerate: false } };
if (mode === 'revoke' && !token) throw new Error('Missing temporary share token to revoke');

async function requestBypass(body) {
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    // Never emit provider response bodies: they may contain credentials.
    throw new Error('Vercel scoped preview access ' + mode + ' failed with HTTP ' + response.status);
  }
  return response;
}

const response = await requestBypass(payload);
if (mode === 'create') {
  const raw = await response.json();
  const protectionBypass = (raw.result ?? raw).protectionBypass;
  const keys = Object.keys(protectionBypass ?? {});
  if (keys.length !== 1 || !/^[A-Za-z0-9_-]{32,}$/.test(keys[0])) {
    throw new Error('Vercel did not return exactly one shareable-link token');
  }
  // A created link must not outlive a failed attempt to publish its token.
  try {
    if (!output) throw new Error('GITHUB_OUTPUT is required');
    process.stdout.write('::add-mask::' + keys[0] + '\n');
    // Report availability only after the complete token has been written.
    appendFileSync(output, 'token=' + keys[0] + '\navailable=true\n');
  } catch (publicationError) {
    try {
      await requestBypass({ revoke: { secret: keys[0], regenerate: false } });
    } catch {
      process.stderr.write('WARNING: Could not revoke unpublished temporary preview access\n');
    }
    throw publicationError;
  }
  process.stdout.write('Created expiring, deployment-scoped Momentic preview access\n');
} else {
  process.stdout.write('Revoked temporary Momentic preview access\n');
}
