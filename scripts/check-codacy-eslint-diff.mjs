/** Fail-closed validation of Codacy's ESLint9 changed-file analysis. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';

export function validateDiffReport(report, cliExit, expectedFiles, independentlyLintedFiles = []) {
  if (![0, 1].includes(cliExit)) throw new Error(`Codacy analyzer failed (exit ${cliExit})`);
  if (!report || !Array.isArray(report.issues) || !Array.isArray(report.errors) || !Array.isArray(report.toolResults)) {
    throw new Error('Codacy diff report is missing required arrays');
  }
  if (report.errors.length) throw new Error(`Codacy analyzer reported ${report.errors.length} execution error(s)`);
  const tools = report.toolResults.filter((tool) => tool.toolId === 'ESLint9');
  if (report.toolResults.length !== tools.length || tools.length > 1) throw new Error('Unexpected Codacy analyzer results');
  // Codacy reports oversized skips explicitly. The generated Supabase type file
  // is checked by tsc, not Codacy, and is the only accepted oversized skip.
  // Fail closed on every skipped handwritten/unknown file.
  const skipped = report.skippedFiles ?? [];
  if (!Array.isArray(skipped)) throw new Error('Codacy skippedFiles must be an array');
  const skippedPaths = new Set();
  for (const entry of skipped) {
    if (!entry || entry.filePath !== 'src/lib/supabase/database.types.ts' ||
        !Number.isInteger(entry.sizeBytes) || entry.sizeBytes < 250_000 ||
        !expectedFiles.includes(entry.filePath) || skippedPaths.has(entry.filePath)) {
      throw new Error(`Codacy skipped an unexpected lintable file: ${entry?.filePath ?? 'unknown'}`);
    }
    skippedPaths.add(entry.filePath);
  }
  const expectedAnalyzed = expectedFiles.filter((path) => !skippedPaths.has(path)).length;
  const [tool] = tools;
  if (!tool) {
    if (expectedAnalyzed) throw new Error(`ESLint9 skipped ${expectedAnalyzed} changed lintable file(s)`);
    if (report.issues.length || cliExit !== 0) throw new Error('Unexpected issues or exit code with no analyzable files');
    return 'No changed ESLint-analyzable files; verified clean skip';
  }
  if (tool.status !== 'success' || !Number.isInteger(tool.filesAnalyzed) ||
      tool.filesAnalyzed < 1 || tool.errorCount !== 0 ||
      !Number.isInteger(tool.issueCount) || tool.issueCount !== report.issues.length) {
    throw new Error('ESLint9 did not complete a consistent, successful analysis');
  }
  const ordinaryFiles = expectedFiles.filter((file) => !skippedPaths.has(file));
  // If Codacy under-counts (without a documented oversized generated skip),
  // check EVERY remaining changed source with the repository's own ESLint rules.
  if (tool.filesAnalyzed < ordinaryFiles.length &&
      !ordinaryFiles.every((file) => independentlyLintedFiles.includes(file))) {
    throw new Error(`ESLint9 analyzed ${tool.filesAnalyzed}/${ordinaryFiles.length} ordinary files; independent lint coverage missing`);
  }
  if (report.issues.length || cliExit !== 0) {
    throw new Error(`${report.issues.length} ESLint9 finding(s) in changed files (CLI exit ${cliExit})`);
  }
  return `ESLint9 passed on ${tool.filesAnalyzed} files with 0 findings`;
}

export async function changedLintableFiles(baseSha) {
  if (!/^[0-9a-f]{40}$/i.test(baseSha)) throw new Error('Missing or invalid PR base SHA');
  const paths = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', '-z', `${baseSha}...HEAD`])
    .toString().split('\0').filter(Boolean).filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  const eslint = new ESLint();
  const eligible = [];
  for (const path of paths) if (!(await eslint.isPathIgnored(path))) eligible.push(path);
  return eligible;
}

async function main() {
  const [file, base, exitText] = process.argv.slice(2);
  if (!file || !base || !/^(0|1|[2-9]\d*)$/.test(exitText ?? '')) throw new Error('Usage: check-codacy-eslint-diff.mjs <report> <base SHA> <exit code>');
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const expected = await changedLintableFiles(base);
  const skipped = Array.isArray(report.skippedFiles) ? report.skippedFiles : [];
  const documentedSkip = new Set(skipped.filter((entry) =>
    entry?.filePath === 'src/lib/supabase/database.types.ts' &&
    Number.isInteger(entry.sizeBytes) && entry.sizeBytes >= 250_000
  ).map((entry) => entry.filePath));
  const ordinaryFiles = expected.filter((file) => !documentedSkip.has(file));
  const tool = report.toolResults?.find((entry) => entry.toolId === 'ESLint9');
  let independentlyLintedFiles = [];
  if (tool && Number.isInteger(tool.filesAnalyzed) &&
      tool.filesAnalyzed < ordinaryFiles.length) {
    const eslint = new ESLint();
    const results = await eslint.lintFiles(ordinaryFiles);
    independentlyLintedFiles = results.map((result) =>
      relative(process.cwd(), result.filePath).replaceAll('\\', '/'));
    const missed = ordinaryFiles.filter((file) => !independentlyLintedFiles.includes(file));
    const findings = results.filter((result) =>
      result.errorCount || result.warningCount || result.fatalErrorCount);
    if (missed.length || findings.length) {
      throw new Error(`Independent ESLint failed: missing=${JSON.stringify(missed)}, findings=${findings.map((r) => r.filePath).join(',')}`);
    }
    console.log(`Independent ESLint verified all ${ordinaryFiles.length} ordinary changed files (Codacy counted ${tool.filesAnalyzed}).`);
  }
  console.log(validateDiffReport(report, Number(exitText), expected, independentlyLintedFiles));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(`::error::${error.message}`); process.exitCode = 1; });
}
