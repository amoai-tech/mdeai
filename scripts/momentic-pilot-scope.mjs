// skipcq: JS-0833 -- Node .mjs uses ESM; DeepSource parser reports a false script-mode error.
/** Select only trusted, read-only Momentic tests for files changed by a PR. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RENTAL_TESTS = [
  'momentic/rentals/exact-bedroom-filter.test.yaml',
  'momentic/rentals/broker-guest-redirect.test.yaml',
  'momentic/rentals/renter-saved-guest-redirect.test.yaml',
  'momentic/rentals/search-to-details.test.yaml',
  'momentic/rentals/viewing-form-no-submit.test.yaml',
];
export const EVENT_TESTS = ['momentic/events/public-event-details.test.yaml'];
export const CONCIERGE_TESTS = ['momentic/concierge/guest-chat-entry.test.yaml'];

const RENTAL_CHANGE = /^(src\/app\/rentals\/|src\/app\/app\/rentals\/|src\/app\/app\/me\/saved\/|src\/app\/api\/leads\/schedule-viewing\/|src\/components\/rentals\/|src\/components\/modals\/schedule-viewing-modal\.tsx$|src\/lib\/rentals\/|src\/mastra\/tools\/search-rentals\.ts$|src\/mastra\/lib\/intelligence-rental-search\.ts$|momentic\/rentals\/)/;
const EVENT_CHANGE = /^(src\/app\/events\/|src\/app\/app\/events\/|src\/app\/api\/events\/|src\/components\/events\/|src\/components\/sheets\/event|src\/mastra\/agents\/(event-agent|host-event)\.ts$|momentic\/events\/)/;
const CONCIERGE_CHANGE = /^(src\/app\/chat\/|src\/components\/chat\/|src\/app\/api\/copilotkit\/|src\/lib\/copilotkit-|src\/mastra\/agents\/concierge|momentic\/concierge\/)/;
const SHARED_CHANGE = /^(momentic\.config\.yaml|scripts\/momentic-(rentals-preview-url|pilot-scope|preview-link)\.mjs|scripts\/__tests__\/momentic-(rentals-preview-url|pilot-scope|preview-link)\.test\.mjs|\.github\/workflows\/momentic-rentals-preview\.yml|src\/hooks\/use-session\.ts|src\/components\/auth\/auth-status\.tsx)$/;

export function selectMomenticPilotTests(paths) {
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) {
    throw new TypeError('Expected an array of changed file paths');
  }
  if (paths.some((p) => SHARED_CHANGE.test(p))) {
    return [...RENTAL_TESTS, ...EVENT_TESTS, ...CONCIERGE_TESTS];
  }
  return [
    ...(paths.some((p) => RENTAL_CHANGE.test(p)) ? RENTAL_TESTS : []),
    ...(paths.some((p) => EVENT_CHANGE.test(p)) ? EVENT_TESTS : []),
    ...(paths.some((p) => CONCIERGE_CHANGE.test(p)) ? CONCIERGE_TESTS : []),
  ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const changedPaths = readFileSync(0, 'utf8').split('\n').filter(Boolean);
  process.stdout.write(`${JSON.stringify(selectMomenticPilotTests(changedPaths))}\n`);
}
