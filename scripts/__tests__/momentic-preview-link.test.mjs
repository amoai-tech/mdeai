import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const script = fileURLToPath(new URL('../momentic-preview-link.mjs', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'mde-momentic-link-'));
const output = join(directory, 'github-output');
const preload = join(directory, 'fake-vercel.mjs');
writeFileSync(preload, [
  "const token = 'A'.repeat(32);",
  "globalThis.fetch = async (_url, options) => {",
  "  const url = new URL(_url);",
  "  if (url.searchParams.get('slug') !== 'amo-agency') throw new Error('Wrong Vercel team scope');",

  "  const body = JSON.parse(options.body);",
  "  if (body.ttl === 1800) {",
  "    process.stderr.write('CREATED\\n');",
  "    return new Response(JSON.stringify({ result: { protectionBypass: { [token]: {} } } }), { status: 200 });",
  "  }",
  "  if (body.revoke?.secret === token) {",
  "    process.stderr.write('REVOKED\\n');",
  "    return new Response('{}', { status: process.env.MOCK_REVOKE_FAIL ? 503 : 200 });",
  "  }",
  "  throw new Error('Unexpected mocked Vercel request');",
  "};",
  "if (process.env.MOCK_MASK_FAIL) {",
  "  process.stdout.write = () => { throw new Error('Could not publish mask'); };",
  "}",
].join('\n'));

function run(overrides) {
  const env = {
    ...process.env,
    VERCEL_DEPLOYMENT_ID: 'dpl_fake_test',
    VERCEL_TOKEN: 'fake-api-key',
    GITHUB_OUTPUT: output,
    MOCK_MASK_FAIL: '',
    MOCK_REVOKE_FAIL: '',
    ...overrides,
  };
  return spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, script, 'create'],
    { env, encoding: 'utf8', timeout: 10_000 });
}

after(() => rmSync(directory, { recursive: true, force: true }));

test('successful link publishes masked token and availability', () => {
  const result = run({});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::add-mask::/);
  assert.match(readFileSync(output, 'utf8'), /^token=A{32}\navailable=true\n$/);
  assert.doesNotMatch(result.stderr, /REVOKED/);
});

test('mask publication error triggers compensating revoke and retains original error', () => {
  const result = run({ MOCK_MASK_FAIL: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REVOKED/);
  assert.match(result.stderr, /Could not publish mask/);
  assert.doesNotMatch(result.stdout, /available=true/);
});

test('output publication error triggers compensating revoke without reporting available', () => {
  const result = run({ GITHUB_OUTPUT: join(directory, 'missing', 'output') });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REVOKED/);
  assert.match(result.stderr, /ENOENT/);
  assert.doesNotMatch(result.stdout, /available=true/);
});

test('original publication error survives a failed compensating revoke', () => {
  const result = run({ MOCK_MASK_FAIL: '1', MOCK_REVOKE_FAIL: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Could not publish mask/);
  assert.match(result.stderr, /Could not revoke unpublished/);
});
