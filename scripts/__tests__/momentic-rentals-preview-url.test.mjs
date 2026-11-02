import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewStartUrl } from '../momentic-rentals-preview-url.mjs';

const preview = 'https://mdeai-git-example-amoai.vercel.app/';
const expectedPaths = new Map([
  ['exact-bedroom-filter.test.yaml', '/'],
  ['search-to-details.test.yaml', '/rentals?neighborhood=Laureles&beds=2'],
  ['viewing-form-no-submit.test.yaml', '/rentals?neighborhood=Laureles&beds=2'],
  ['broker-guest-redirect.test.yaml', '/app/rentals'],
  ['renter-saved-guest-redirect.test.yaml', '/app/me/saved'],
]);
for (const [file, suffix] of expectedPaths) {
  test(`preview override preserves exact route and query for ${file}`, () => {
    const path = `momentic/rentals/${file}`;
    const yaml = readFileSync(path, 'utf8');
    assert.equal(previewStartUrl(preview, yaml, path), new URL(suffix, preview).href);
  });
}
test('rejects unverified origins, unsafe paths and foreign test URLs', () => {
  const path = 'momentic/rentals/exact-bedroom-filter.test.yaml';
  const yaml = 'url: https://www.mdeai.co/';
  for (const origin of ['https://evil.example/', 'http://mdeai-git-test.vercel.app/',
    'https://mdeai-git-test.vercel.app/private', 'https://mdeai-git-test.vercel.app/?token=secret',
    'https://user:password@mdeai-git-test.vercel.app/']) {
    assert.throws(() => previewStartUrl(origin, yaml, path));
  }
  assert.throws(() => previewStartUrl(preview, 'url: https://evil.example/', path));
  assert.throws(() => previewStartUrl(preview, yaml, '../secrets.yaml'));
  assert.throws(() => previewStartUrl(preview, 'steps: []', path));
});

test('scoped access is appended without dropping the trusted test route or filters', () => {
  const path = 'momentic/rentals/search-to-details.test.yaml';
  const yaml = readFileSync(path, 'utf8');
  const previous = process.env.MOMENTIC_PREVIEW_SHARE_TOKEN;
  try {
    process.env.MOMENTIC_PREVIEW_SHARE_TOKEN = 'a'.repeat(32);
    const url = new URL(previewStartUrl(preview, yaml, path));
    assert.equal(url.pathname, '/rentals');
    assert.equal(url.searchParams.get('neighborhood'), 'Laureles');
    assert.equal(url.searchParams.get('beds'), '2');
    assert.equal(url.searchParams.get('_vercel_share'), 'a'.repeat(32));
    process.env.MOMENTIC_PREVIEW_SHARE_TOKEN = 'invalid';
    assert.throws(() => previewStartUrl(preview, yaml, path), /Invalid scoped/);
  } finally {
    if (previous === undefined) delete process.env.MOMENTIC_PREVIEW_SHARE_TOKEN;
    else process.env.MOMENTIC_PREVIEW_SHARE_TOKEN = previous;
  }
});
