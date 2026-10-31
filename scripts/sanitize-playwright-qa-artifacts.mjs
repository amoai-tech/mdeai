/**
 * Prevent private authenticated Playwright runs from reaching artifact uploads.
 * Shared QA fixtures write a marker to their testInfo.outputDir BEFORE login.
 * On detection, remove all reports for that job, including blob ZIPs/HTML.
 * Keeping public test debug artifacts when no marker exists is intentional.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "mde-private-qa.marker";

function hasPrivateMarker(directory) {
  if (!existsSync(directory)) return false;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === MARKER && entry.isFile()) return true;
    if (entry.isDirectory() && hasPrivateMarker(join(directory, entry.name))) return true;
  }
  return false;
}

export function sanitizePlaywrightQaArtifacts(root) {
  const target = resolve(root);
  if (!hasPrivateMarker(join(target, "test-results"))) return false;
  for (const rel of ["test-results", "tmp/playwright-report", "blob-report"]) {
    rmSync(join(target, rel), { force: true, recursive: true });
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const removed = sanitizePlaywrightQaArtifacts(process.cwd());
  console.log(removed
    ? "Private QA artifacts detected; removed Playwright outputs before CI upload."
    : "No private QA marker; ordinary Playwright artifacts unchanged.");
}
