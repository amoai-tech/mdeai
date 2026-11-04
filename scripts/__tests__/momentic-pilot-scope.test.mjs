import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONCIERGE_TESTS,
  EVENT_TESTS,
  RENTAL_TESTS,
  selectMomenticPilotTests,
} from '../momentic-pilot-scope.mjs';

test('non-discovery PRs select no Momentic tests', () => {
  assert.deepEqual(selectMomenticPilotTests(['docs/README.md', 'src/components/tickets/wallet.tsx']), []);
});

test('rentals changes preserve the existing five trusted tests', () => {
  assert.deepEqual(selectMomenticPilotTests(['src/components/rentals/rental-ask-composer.tsx']), RENTAL_TESTS);
});

test('events and chat changes select only their safe public tests', () => {
  assert.deepEqual(selectMomenticPilotTests(['src/app/events/(browse)/page.tsx']), EVENT_TESTS);
  assert.deepEqual(selectMomenticPilotTests(['src/components/chat/geo-chat-shell.tsx']), CONCIERGE_TESTS);
});

test('multi-area changes combine suites exactly once', () => {
  assert.deepEqual(selectMomenticPilotTests([
    'src/app/events/(browse)/page.tsx',
    'src/app/chat/page.tsx',
    'src/app/chat/page.tsx',
  ]), [...EVENT_TESTS, ...CONCIERGE_TESTS]);
});

test('shared auth, selection script and workflow changes select all trusted suites', () => {
  for (const changed of ['src/hooks/use-session.ts', 'scripts/momentic-pilot-scope.mjs',
    'scripts/momentic-preview-link.mjs', '.github/workflows/momentic-rentals-preview.yml',
    'momentic.config.yaml']) {
    assert.deepEqual(selectMomenticPilotTests([changed]), [...RENTAL_TESTS, ...EVENT_TESTS, ...CONCIERGE_TESTS]);
  }
});

test('no basename trick, near match or unsafe input selects tests', () => {
  assert.deepEqual(selectMomenticPilotTests([
    'docs/src/app/chat/page.tsx', 'src/app/marketing/events/page.tsx',
    'momentic/rentals-backup/test.test.yaml',
  ]), []);
  assert.throws(() => selectMomenticPilotTests('src/app/chat/page.tsx'), TypeError);
});
