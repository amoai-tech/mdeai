import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { previewStartUrl } from '../momentic-rentals-preview-url.mjs';

const preview = 'https://mdeai-git-example-amoai.vercel.app/';
const expectedPaths = new Map([
  ['momentic/rentals/exact-bedroom-filter.test.yaml', '/'],
  ['momentic/rentals/search-to-details.test.yaml', '/rentals?neighborhood=Laureles&beds=2'],
  ['momentic/rentals/viewing-form-no-submit.test.yaml', '/rentals?neighborhood=Laureles&beds=2'],
  ['momentic/rentals/broker-guest-redirect.test.yaml', '/app/rentals'],
  ['momentic/rentals/renter-saved-guest-redirect.test.yaml', '/app/me/saved'],
  ['momentic/events/public-event-details.test.yaml', '/events'],
  ['momentic/concierge/guest-chat-entry.test.yaml', '/chat'],
  ['momentic/maps/browse-map-selection.test.yaml', '/rentals'],
]);
for (const [path, suffix] of expectedPaths) {
  test(`preview override preserves exact route and query for ${path}`, () => {
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

test('broker guest redirect accepts only the exact destination, with matching Vercel share when present', () => {
  const yaml = readFileSync('momentic/rentals/broker-guest-redirect.test.yaml', 'utf8');
  const codeBlock = /^  - javascript:\n      code: \|\n((?:        [^\n]*\n)+)      environment: BROWSER/m.exec(yaml);
  assert.ok(codeBlock, 'broker redirect test must keep a deterministic browser-side URL assertion');
  const code = codeBlock[1].split('\n').map((line) => line.startsWith('        ') ? line.slice(8) : line).join('\n');
  const share = 'a'.repeat(32);
  const nested = encodeURIComponent('/app/rentals?_vercel_share=' + share);
  const base = 'https://mdeai-example-amo-agency.vercel.app';
  for (const path of [
    '/login?next=%2Fapp%2Frentals',
    '/login?_vercel_share=' + share + '&next=' + nested,
    '/login?next=' + nested + '&_vercel_share=' + share,
  ]) {
    assert.doesNotThrow(() => runInNewContext(code, { URL, window: { location: { href: base + path } } }), path);
  }
  for (const path of [
    '/login?notnext=%2Fapp%2Frentals',
    '/login?next=%2Fapp%2Fme%2Fsaved',
    '/login?next=' + encodeURIComponent('https://evil.example/app/rentals'),
    '/login?next=' + encodeURIComponent('/app/rentals?role=admin'),
    '/login?_vercel_share=' + share + '&next=' + encodeURIComponent('/app/rentals?_vercel_share=b'),
    '/login-nope?next=%2Fapp%2Frentals',
  ]) {
    assert.throws(() => runInNewContext(code, { URL, window: { location: { href: base + path } } }), path);
  }
});
