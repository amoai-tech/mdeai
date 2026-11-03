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
  assert.throws(() => validateDiffReport(complete(), 0, ['a.ts', 'b.ts', 'c.ts', 'd.ts']), /independent lint coverage missing/);
});

test('Codacy may explicitly skip only the oversized generated Supabase types', () => {
  const generated = 'src/lib/supabase/database.types.ts';
  const report = {
    ...complete(),
    skippedFiles: [{ filePath: generated, sizeBytes: 324245 }],
  };
  assert.match(
    validateDiffReport(report, 0, ['src/a.ts', 'src/b.ts', 'src/c.ts', generated]),
    /passed/,
  );
});

test('skipping handwritten code, unknown files or small generated files fails', () => {
  const generated = 'src/lib/supabase/database.types.ts';
  for (const skippedFiles of [
    [{ filePath: 'src/api/important.ts', sizeBytes: 324245 }],
    [{ filePath: generated, sizeBytes: 200 }],
    [{ filePath: 'src/unexpected.ts', sizeBytes: 324245 }],
    [{ filePath: generated, sizeBytes: 324245 }, { filePath: generated, sizeBytes: 324245 }],
  ]) {
    assert.throws(
      () => validateDiffReport({ ...complete(), skippedFiles }, 0,
        ['src/api/important.ts', generated]),
      /unexpected lintable file/,
    );
  }
});

test('a skipped generated file cannot hide missing ordinary ESLint coverage', () => {
  const generated = 'src/lib/supabase/database.types.ts';
  assert.throws(
    () => validateDiffReport({
      ...complete(), skippedFiles: [{ filePath: generated, sizeBytes: 324245 }],
    }, 0, ['a.ts', 'b.ts', 'c.ts', 'd.ts', generated]),
    /independent lint coverage missing/,
  );
});

test('Codacy under-count is accepted only with independent ESLint coverage of every changed file', () => {
  const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts'];
  assert.throws(
    () => validateDiffReport(complete(), 0, files, ['a.ts', 'b.ts', 'c.ts']),
    /independent lint coverage missing/,
  );
  assert.match(
    validateDiffReport(complete(), 0, files, files),
    /passed/,
  );
});

test('independent ESLint cannot rescue a crashed Codacy analyzer or lint finding', () => {
  const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts'];
  assert.throws(
    () => validateDiffReport({ ...complete(), toolResults: [{ ...complete().toolResults[0], status: 'failed' }] }, 0, files, files),
    /consistent, successful/,
  );
  assert.throws(
    () => validateDiffReport(complete([{ filePath: 'a.ts' }]), 1, files, files),
    /finding/,
  );
});

test('documented generated skip still requires independent coverage of every ordinary file', () => {
  const generated = 'src/lib/supabase/database.types.ts';
  const all = ['a.ts', 'b.ts', 'c.ts', 'd.ts', generated];
  const report = { ...complete(), skippedFiles: [{ filePath: generated, sizeBytes: 324245 }] };
  assert.throws(
    () => validateDiffReport(report, 0, all, ['a.ts', 'b.ts', 'c.ts']),
    /independent lint coverage missing/,
  );
  assert.match(validateDiffReport(report, 0, all, ['a.ts','b.ts','c.ts','d.ts']), /passed/);
});
