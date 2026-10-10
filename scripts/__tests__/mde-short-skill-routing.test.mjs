import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cases, evaluateCase } from '../verify-deepseek-routing.mjs';

const root = resolve(import.meta.dirname, '../..');

test('new short skills and specialist fallbacks satisfy MDE routing contract', () => {
  const result = execFileSync('python3', [
    '.claude/skills/using-mde-skills/scripts/test-routing-contract.py',
  ], { cwd: root, encoding: 'utf8' });
  assert.match(result, /routing contract: PASS \(54\/54 cases\)/);

  const instructions = readFileSync(resolve(root, 'AGENTS.md'), 'utf8');
  const startup = readFileSync(resolve(root, '.claude/hooks/session-start.mjs'), 'utf8');
  for (const name of ['errors', 'praudit', 'linear-task', 'linear-audit', 'implement', 'efficient', 'tests']) {
    assert.ok(instructions.includes('\\`'+name+'\\`') || instructions.includes('`'+name+'`'), 'missing routing owner '+name);
    assert.ok(startup.includes(name), 'missing startup owner '+name);
  }
  assert.match(instructions, /S4 verification stays independent/);
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
