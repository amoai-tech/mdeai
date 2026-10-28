import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDiffReport } from '../check-codacy-eslint-diff.mjs';

const complete = (issues = []) => ({
  issues, errors: [], toolResults: [{ toolId: 'ESLint9', status: 'success', filesAnalyzed: 3, issueCount: issues.length, errorCount: 0 }],
});

test('clean analysis of changed source passes', () => {
  assert.match(validateDiffReport(complete(), 0, ['src/changed.ts']), /passed/);
});
test('reported lint finding fails even when the CLI exits zero', () => {
  assert.throws(() => validateDiffReport(complete([{ filePath: 'src/changed.ts' }]), 0, ['src/changed.ts']), /finding/);
});
test('normal CLI issue exit also fails', () => {
  assert.throws(() => validateDiffReport(complete([{ filePath: 'src/changed.ts' }]), 1, ['src/changed.ts']), /finding/);
});
test('a failed CLI cannot report success', () => {
  assert.throws(() => validateDiffReport(complete(), 2, ['src/changed.ts']), /failed/);
});
test('analyzer exceptions fail even with no issues', () => {
  assert.throws(() => validateDiffReport({ ...complete(), errors: [{ phase: 'toolInvoke', message: 'crash' }] }, 0, ['src/changed.ts']), /error/);
});
test('missing analysis fails for changed lintable source', () => {
  assert.throws(() => validateDiffReport({ issues: [], errors: [], toolResults: [] }, 0, ['src/changed.ts']), /skipped/);
});
test('true no-lintable-source diff can legitimately execute no tool', () => {
  assert.match(validateDiffReport({ issues: [], errors: [], toolResults: [] }, 0, []), /clean skip/);
});
test('bad or contradictory report cannot pass', () => {
  assert.throws(() => validateDiffReport({ ...complete(), issues: undefined }, 0, []), /missing/);
  assert.throws(() => validateDiffReport({ ...complete(), toolResults: [{ ...complete().toolResults[0], status: 'failed' }] }, 0, ['src/changed.ts']), /successful/);
  assert.throws(() => validateDiffReport({ ...complete(), toolResults: [{ ...complete().toolResults[0], issueCount: 3 }] }, 0, ['src/changed.ts']), /consistent/);
});

test('partial source coverage cannot pass', () => {
  assert.throws(() => validateDiffReport(complete(), 0, ['a.ts', 'b.ts', 'c.ts', 'd.ts']), /successful/);
});
