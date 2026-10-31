import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const workflow = fs.readFileSync('.github/workflows/momentic-rentals-preview.yml', 'utf8');

test('advisory preview suite is selected only by pull-request Floor checks', () => {
  assert.match(workflow, /github\.event\.workflow_run\.event == 'pull_request'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
  assert.match(workflow, /ref: main/);
});

test('all five read-only Momentic journeys must finish before PASS is reported', () => {
  for (const name of ['exact-bedroom-filter', 'broker-guest-redirect', 'renter-saved-guest-redirect', 'search-to-details', 'viewing-form-no-submit']) {
    assert.match(workflow, new RegExp(`^\\s+${name}\\s*$`, 'm'));
  }
  assert.match(workflow, /if \[\[ "\$OUTCOME" == success \]\]; then\s+result="PASS — 5\/5/);
  assert.match(workflow, /--retries 0/);
});

test('an inaccessible preview is reported BLOCKED, not a passing browser test', () => {
  assert.match(workflow, /BLOCKED — preview protected or unavailable \(0\/5 executed\)/);
  assert.match(workflow, /BLOCKED — no verified READY preview \(0\/5 executed\)/);
  assert.doesNotMatch(workflow, /BLOCKED — SSO-protected preview/, "network/HTTP failures are not proof of SSO");
  assert.match(workflow, /Advisory, not a required merge check/);
  assert.match(workflow, /-f conclusion=neutral/);
});
