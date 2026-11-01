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
endpoint.searchParams.set('slug', 'amoco');

const payload = mode === 'create'
  ? { ttl: 1800 }
  : { revoke: { secret: token, regenerate: false } };
if (mode === 'revoke' && !token) throw new Error('Missing temporary share token to revoke');

const response = await fetch(endpoint, {
  method: 'PATCH',
  headers: {
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(15000),
});
if (!response.ok) {
  // Never emit response bodies: providers may include credential-bearing data.
  throw new Error('Vercel scoped preview access ' + mode + ' failed with HTTP ' + response.status);
}
if (mode === 'create') {
  const raw = await response.json();
  const protectionBypass = (raw.result ?? raw).protectionBypass;
  const keys = Object.keys(protectionBypass ?? {});
  if (keys.length !== 1 || !/^[A-Za-z0-9_-]{32,}$/.test(keys[0])) {
    throw new Error('Vercel did not return exactly one shareable-link token');
  }
  if (!output) throw new Error('GITHUB_OUTPUT is required');
  // GitHub must mask the token before any later shell step uses it.
  process.stdout.write('::add-mask::' + keys[0] + '\n');
  appendFileSync(output, 'available=true\ntoken=' + keys[0] + '\n');
  process.stdout.write('Created expiring, deployment-scoped Momentic preview access\n');
} else {
  process.stdout.write('Revoked temporary Momentic preview access\n');
}
