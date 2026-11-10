import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { test } from 'node:test';
import { RENTAL_TESTS, EVENT_TESTS, CONCIERGE_TESTS, selectMomenticPilotTests } from '../momentic-pilot-scope.mjs';

const workflow = fs.readFileSync('.github/workflows/momentic-rentals-preview.yml', 'utf8');

test('advisory preview still selects only current PRs after Floor and executes trusted main', () => {
  assert.match(workflow, /github\.event\.workflow_run\.event == 'pull_request'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /actual.*DEPLOY_SHA/);
});

test('all five Rentals tests remain selected together, and every new public test exists', () => {
  assert.equal(RENTAL_TESTS.length, 5);
  assert.deepEqual(selectMomenticPilotTests(['src/components/rentals/rental-browse-card.tsx']), RENTAL_TESTS);
  // Explicit trusted paths; static reads avoid dynamic filesystem access in this privileged-CI test.
  const fixtures = [
    ['momentic/rentals/exact-bedroom-filter.test.yaml', fs.readFileSync('momentic/rentals/exact-bedroom-filter.test.yaml', 'utf8')],
    ['momentic/rentals/broker-guest-redirect.test.yaml', fs.readFileSync('momentic/rentals/broker-guest-redirect.test.yaml', 'utf8')],
    ['momentic/rentals/renter-saved-guest-redirect.test.yaml', fs.readFileSync('momentic/rentals/renter-saved-guest-redirect.test.yaml', 'utf8')],
    ['momentic/rentals/search-to-details.test.yaml', fs.readFileSync('momentic/rentals/search-to-details.test.yaml', 'utf8')],
    ['momentic/rentals/viewing-form-no-submit.test.yaml', fs.readFileSync('momentic/rentals/viewing-form-no-submit.test.yaml', 'utf8')],
    ['momentic/events/public-event-details.test.yaml', fs.readFileSync('momentic/events/public-event-details.test.yaml', 'utf8')],
    ['momentic/concierge/guest-chat-entry.test.yaml', fs.readFileSync('momentic/concierge/guest-chat-entry.test.yaml', 'utf8')],
  ];
  assert.deepEqual(fixtures.map(([path]) => path), [...RENTAL_TESTS, ...EVENT_TESTS, ...CONCIERGE_TESTS]);
  for (const [, text] of fixtures) assert.match(text, /- read-only/);
});

test('selected test count, real execution, and success must agree before PASS', () => {
  assert.match(workflow, /tests_json=\$\(printf/);
  assert.match(workflow, /count=\$\(jq -er 'length'/);
  assert.match(workflow, /while IFS= read -r path; do[\s\S]*?momentic@3\.69\.0 run "\$path"/);
  assert.match(workflow, /--retries 0/);
  assert.match(workflow, /elif \[\[ "\$OUTCOME" == success \]\]; then\s+result="PASS — \$count\/\$count/);
  assert.doesNotMatch(workflow, /result="PASS — 5\/5/);
});

test('unavailable preview, missing tests, or failed browser checks never count as PASS', () => {
  assert.match(workflow, /selection_ok=true/);
  assert.match(workflow, /SELECTION_OK: \$\{\{ steps\.scope\.outputs\.selection_ok \}\}/);
  assert.match(workflow, /if \[\[ "\$SELECTION_OK" != true \]\]; then/);
  assert.match(workflow, /ERROR — could not select trusted tests for this PR/);
  assert.match(workflow, /SKIPPED — no public discovery tests affected/);
  assert.match(workflow, /BLOCKED — browser test run was cancelled; result unknown/);
  assert.match(workflow, /BLOCKED — no verified READY preview \(0\/\$count executed\)/);
  assert.match(workflow, /BLOCKED — trusted tests unavailable on main/);
  assert.match(workflow, /FAIL — selected Momentic test failed/);
  assert.match(workflow, /conclusion=neutral/);
  assert.match(workflow, /conclusion=success/);
  assert.match(workflow, /conclusion=failure/);
  assert.match(workflow, /Advisory, not a required merge check/);
});

test('scoped preview access is created, revoked before reporting, and cleanup failure is visible', () => {
  const create = workflow.indexOf('momentic-preview-link.mjs create');
  const revoke = workflow.indexOf('momentic-preview-link.mjs revoke');
  const publish = workflow.indexOf('Publish advisory PR check with honest status');
  assert.ok(create !== -1 && revoke > create && publish > revoke);
  assert.match(workflow, /id: revoke/);
  assert.match(workflow, /REVOKED: \$\{\{ steps\.revoke\.outcome \}\}/);
  assert.match(workflow, /ERROR — temporary preview access revocation failed/);
  assert.match(workflow, /MOMENTIC_PREVIEW_SHARE_TOKEN/);
  assert.match(workflow, /--url-override/);
  assert.match(workflow, /started_at=/);
  assert.match(workflow, /completed_at=/);
});

test('Momentic installs on a supported pinned runner and reports setup failure as BLOCKED, not an app regression', () => {
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /id: browser_install/);
  assert.match(workflow, /BROWSER_INSTALL: \$\{\{ steps\.browser_install\.outcome \}\}/);
  const publisher = workflow.split('- name: Publish advisory PR check with honest status\n')[1]?.split('\n      - name: Upload JUnit')[0];
  assert.ok(publisher, 'advisory publisher exists after browser setup and cleanup');
  assert.match(publisher, /if: always\(\) && steps\.scope\.outputs\.pr != ''/);
  assert.match(publisher, /conclusion=neutral/);
  assert.match(publisher, /elif \[\[ "\$SHARED" == true && "\$REVOKED" != success \]\]; then[\s\S]*?conclusion=failure\s+elif \[\[ "\$BROWSER_INSTALL" == failure \]\]; then\s+result="BLOCKED — Momentic Chromium installation failed \(0\/\$count executed\)"/);
  assert.match(publisher, /elif \[\[ "\$BROWSER_INSTALL" == failure \]\]; then[\s\S]*?elif \[\[ "\$OUTCOME" == success \]\]; then/);
  assert.match(publisher, /elif \[\[ "\$BROWSER_INSTALL" == cancelled \]\]; then\s+result="BLOCKED — Momentic Chromium installation cancelled \(0\/\$count executed\)"/);
});

test('publisher executes real shell decision for setup failure, cancellation, and cleanup priority', () => {
  const body = workflow.split('- name: Publish advisory PR check with honest status\n')[1]?.split('\n      - name: Upload JUnit')[0];
  const run = body?.split('        run: |\n')[1]?.split('\n          url=')[0];
  assert.ok(run, 'extract the real publisher decision without invoking GitHub API');
  const script = run.split('\n').map(line => line.replace(/^          /, '')).join('\n')
    + '\nprintf "%s|%s\\n" "$result" "$conclusion"';
  const defaults = {
    SELECTION_OK: 'true', SELECTED: 'true', SHARED: 'true', REVOKED: 'success',
    BROWSER_INSTALL: 'success', OUTCOME: 'skipped', VERIFIED: 'true',
    INSTALLED: 'true', TEST_COUNT: '3',
  };
  const cases = [
    ['install failure', { BROWSER_INSTALL: 'failure' }, 'BLOCKED — Momentic Chromium installation failed (0/3 executed)|neutral'],
    ['install cancellation', { BROWSER_INSTALL: 'cancelled' }, 'BLOCKED — Momentic Chromium installation cancelled (0/3 executed)|neutral'],
    ['cleanup takes priority', { BROWSER_INSTALL: 'failure', REVOKED: 'failure' }, 'ERROR — temporary preview access revocation failed|failure'],
    ['real test success', { OUTCOME: 'success' }, 'PASS — 3/3 selected read-only journeys|success'],
  ];
  for (const [name, changes, expected] of cases) {
    const result = spawnSync('bash', ['-c', script], {
      env: { ...defaults, ...changes }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, name + ': ' + result.stderr);
    assert.equal(result.stdout.trim(), expected, name);
  }
});
