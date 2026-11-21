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

// Skill discovery and metadata checks belong beside the routing contract,
// rather than enlarging the general behavior-eval parser's reviewed patch.
// Paths are literal and checked into the repo: no user-derived filesystem paths.
const KNOWN_SKILL_TEXT = Object.freeze({
  tests: readFileSync('.claude/skills/tests/SKILL.md', 'utf8'),
  testing: readFileSync('.claude/skills/testing/SKILL.md', 'utf8'),
  errors: readFileSync('.claude/skills/errors/SKILL.md', 'utf8'),
  'systematic-debugging': readFileSync('.claude/skills/systematic-debugging/SKILL.md', 'utf8'),
  efficient: readFileSync('.claude/skills/efficient/SKILL.md', 'utf8'),
  ponytail: readFileSync('.claude/skills/ponytail/SKILL.md', 'utf8'),
  maps: readFileSync('.claude/skills/maps/SKILL.md', 'utf8'),
  copilotkit: readFileSync('.claude/skills/copilotkit/SKILL.md', 'utf8'),
  nextjs: readFileSync('.claude/skills/nextjs/SKILL.md', 'utf8'),
  supabase: readFileSync('.claude/skills/supabase/SKILL.md', 'utf8'),
  'real-estate': readFileSync('.claude/skills/real-estate/SKILL.md', 'utf8'),
});
const KNOWN_MIRROR_TEXT = Object.freeze({
  testing: readFileSync('.agents/skills/testing/SKILL.md', 'utf8'),
  'real-estate': readFileSync('.agents/skills/real-estate/SKILL.md', 'utf8'),
  maps: readFileSync('.agents/skills/maps/SKILL.md', 'utf8'),
});

// Adjoining workflow owners share vocabulary but must describe distinct tasks.
// Metadata checks guard loss of key nouns when descriptions are compacted;
// they do NOT prove a model will choose the correct skill.
test("three overlapping pairs keep explicit selection boundaries", () => {
  const descriptor = (name) => {
    assert.ok(Object.hasOwn(KNOWN_SKILL_TEXT, name), name + ": unregistered test skill");
    const skill = KNOWN_SKILL_TEXT[name];
    const front = skill.split("---", 3)[1];
    assert.ok(front);
    return front;
  };
  assert.match(descriptor("tests"), /DESIGN regression coverage/);
  assert.match(descriptor("testing"), /Use when running or interpreting MDE Vitest/);
  assert.match(descriptor("errors"), /actual failing test/);
  assert.match(descriptor("systematic-debugging"), /deep multi-step root-cause/);
  assert.match(descriptor("efficient"), /fastest safe reuse-first/);
  assert.match(descriptor("ponytail"), /source receipts or a thorough reuse-before-build audit/);
  for (const name of ["ponytail", "maps", "copilotkit", "nextjs", "supabase"]) {
    const frontmatter = descriptor(name);
    const match = frontmatter.match(/^description:\s*(?:>-\s*\n)?((?:  [^\n]*\n?)*)/m);
    assert.ok(match, name + ": missing skill description");
    const description = match[1].trim();
    assert.ok(description.length > 0 && description.length <= 500,
      name + ": description exceeds the MDE 500-character limit");
  }
});

// Native Claude Code skill activation obeys frontmatter `paths` globs.
// These three cross-file domain/execution skills must be available from a
// natural-language task before the agent has opened a matching source file.
test("project-wide testing, rental and maps skills have no file activation gate", () => {
  for (const name of ["testing", "real-estate", "maps"]) {
    assert.ok(Object.hasOwn(KNOWN_MIRROR_TEXT, name), name + ": unregistered mirror skill");
    const skill = KNOWN_SKILL_TEXT[name];
    const frontmatter = skill.split("---", 3)[1];
    assert.ok(frontmatter, name + ": missing frontmatter");
    assert.doesNotMatch(frontmatter, /^paths\s*:/m,
      name + ": paths globs silently hide cross-file skills from the Claude session catalog");
    assert.equal(KNOWN_MIRROR_TEXT[name],
      skill, name + ": Codex/DSH mirror differs from canonical skill");
  }
});
