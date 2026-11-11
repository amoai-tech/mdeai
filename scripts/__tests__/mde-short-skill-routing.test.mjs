import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { cases, evaluateCase } from '../verify-deepseek-routing.mjs';

const root = resolve(import.meta.dirname, '../..');

test('new short skills and specialist fallbacks satisfy MDE routing contract', () => {
  const result = execFileSync('python3', [
    '.claude/skills/using-mde-skills/scripts/test-routing-contract.py',
  ], { cwd: root, encoding: 'utf8' });
  const totals = result.match(/routing contract: PASS \((\d+)\/(\d+) cases\)/);
  assert.ok(totals, 'routing contract did not report passing cases');
  assert.equal(totals[1], totals[2], 'not all routing cases passed');
  const expected = JSON.parse(readFileSync(
    resolve(root, '.claude/skills/using-mde-skills/evals/routing-evals.json'), 'utf8'
  ));
  assert.equal(Number(totals[1]), expected.length, 'not all configured cases were run');
  assert.ok(Number(totals[1]) >= 110, 'routing coverage fell below the 110-case baseline');

  const instructions = readFileSync(resolve(root, 'AGENTS.md'), 'utf8');
  const startup = readFileSync(resolve(root, '.claude/hooks/session-start.mjs'), 'utf8');
  for (const name of ['errors', 'praudit', 'linear-task', 'linear-audit', 'implement', 'efficient', 'tests']) {
    assert.ok(instructions.includes('\\`'+name+'\\`') || instructions.includes('`'+name+'`'), 'missing routing owner '+name);
    assert.ok(startup.includes(name), 'missing startup owner '+name);
  }
  // The Python contract checks these too; guard their exact exposure shape
  // in the CI-facing JS test so PR reviewers can see every intended owner.
  for (const name of [
    'linear-task', 'linear-audit', 'praudit', 'errors', 'efficient', 'tests',
    'plan', 'architect', 'implement', 'progress', 'prod', 'merge', 'e2e',
  ]) {
    const exposed = resolve(root, '.agents/skills', name, 'SKILL.md');
    assert.ok(lstatSync(exposed).isSymbolicLink(), name + ': missing mirror symlink');
    assert.equal(
      readFileSync(exposed, 'utf8'),
      readFileSync(resolve(root, '.claude/skills', name, 'SKILL.md'), 'utf8'),
      name + ': mirror does not resolve to canonical skill',
    );
  }
  assert.match(instructions, /S4 verification stays independent/);
  for (const name of ['architect', 'e2e']) {
    assert.ok(instructions.includes('`' + name + '`'), 'missing short skill documentation: ' + name);
  }
});

test('DeepSeek routing probes exercise short skills without echoing their answers', () => {
  assert.ok(cases.length >= 16);
  for (const name of ['short-praudit','short-linear-task','short-linear-audit','short-efficient','short-tests']) {
    assert.ok(cases.some((probe) => probe.name === name), 'missing DSH coverage '+name);
  }
  for (const probe of cases) {
    assert.ok(!probe.prompt.includes('owner=' + probe.owner), probe.name + ': answer leaked');
    assert.ok(!probe.prompt.includes('verifier=' + String(probe.verifier)), probe.name + ': verification answer leaked');
    assert.equal(evaluateCase(probe, 0, `owner=${probe.owner} verifier=${probe.verifier}`).ok, true);
    assert.equal(evaluateCase(probe, 1, `owner=${probe.owner} verifier=${probe.verifier}`).ok, false);
  }
});
