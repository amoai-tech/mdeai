import test from 'node:test';
import assert from 'node:assert/strict';
import { isMatchingEventDetails } from '../qa/a2ui-matrix-verdict.mjs';

test('passes only when the requested real event card opens its own Details', () => {
  assert.equal(isMatchingEventDetails({ requestedSourceId: 'evt-2', renderedCardIds: ['evt-2'], openedDetailsId: 'evt-2' }), true);
});

test('does not mistake a different event card and matching Details for the requested fourth event', () => {
  assert.equal(isMatchingEventDetails({ requestedSourceId: null, renderedCardIds: ['evt-1'], openedDetailsId: 'evt-1' }), false);
});

test('fails when the requested card exists but Details opens another event', () => {
  assert.equal(isMatchingEventDetails({ requestedSourceId: 'evt-2', renderedCardIds: ['evt-2'], openedDetailsId: 'evt-1' }), false);
});

test('fails when a different card opens, even if the requested event exists in the published grid', () => {
  assert.equal(isMatchingEventDetails({ requestedSourceId: 'evt-2', renderedCardIds: ['evt-1'], openedDetailsId: 'evt-1' }), false);
});

import { selectMatrixCases } from '../qa/a2ui-matrix-verdict.mjs';

const rentals = [{ id: 'rental-first' }];
const events = [{ id: 'event-first' }];

test('selects only known cases in the requested suite', () => {
  assert.deepEqual(selectMatrixCases({ suite: 'events', only: 'event-first', rentals, events }), { rentals: [], events });
});

test('fails instead of reporting success when an --only typo matches no case', () => {
  assert.throws(() => selectMatrixCases({ suite: 'events', only: 'event-thrid', rentals, events }), /Unknown QA case/);
});

test('fails rather than reporting zero cases passed for an invalid --suite', () => {
  assert.throws(() => selectMatrixCases({ suite: 'event', only: '', rentals, events }), /Unknown QA suite/);
});


import { waitForIdleComposer } from '../qa/a2ui-matrix-verdict.mjs';

test('waits for the Events composer to be ready and not busy before filling a prompt', async () => {
  const selectors = [];
  const page = { locator: (selector) => ({ waitFor: async (opts) => { selectors.push([selector, opts.state]); } }) };
  await waitForIdleComposer(page, '[data-testid="discovery-ask-input"]');
  assert.deepEqual(selectors, [
    ['[data-testid="discovery-ask-events"][data-ready="true"][aria-busy="false"]', 'visible'],
    ['[data-testid="discovery-ask-input"]', 'visible'],
  ]);
});

test('waits until a rental answer is no longer running before another prompt', async () => {
  const selectors = [];
  const page = { locator: (selector) => ({ waitFor: async (opts) => { selectors.push([selector, opts.state]); } }) };
  await waitForIdleComposer(page, '#rental-ask-input');
  assert.deepEqual(selectors, [
    ['[data-testid="rental-ask-send"]', 'visible'],
    ['#rental-ask-input', 'visible'],
  ]);
});


// Security regression: QA artifacts must never be written to an operator-supplied path.
// If a caller attempts --out, fail *before* connecting to Chrome.
import { spawnSync } from 'node:child_process';

test('rejects caller-controlled artifact output paths before contacting Chrome', () => {
  const result = spawnSync(process.execPath, [
    'scripts/qa/a2ui-matrix.mjs', '--out', '../untrusted-dir',
  ], { encoding: 'utf8', timeout: 8000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--out is not supported/i);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|connectOverCDP/);
});


test('rejects --out=path form before contacting Chrome', () => {
  const result = spawnSync(process.execPath, [
    'scripts/qa/a2ui-matrix.mjs', '--out=/tmp/untrusted-dir',
  ], { encoding: 'utf8', timeout: 8000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--out is not supported/i);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|connectOverCDP/);
});
