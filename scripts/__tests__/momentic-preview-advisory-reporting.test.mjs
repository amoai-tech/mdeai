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
  assert.match(workflow, /^\s+exact-bedroom-filter\s*$/m);
  assert.match(workflow, /^\s+broker-guest-redirect\s*$/m);
  assert.match(workflow, /^\s+renter-saved-guest-redirect\s*$/m);
  assert.match(workflow, /^\s+search-to-details\s*$/m);
  assert.match(workflow, /^\s+viewing-form-no-submit\s*$/m);
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
