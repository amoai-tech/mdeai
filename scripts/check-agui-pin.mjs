#!/usr/bin/env node
/**
 * AGUI-001 — keep the AG-UI pins exact.
 *
 * `@ag-ui/client` and `@ag-ui/mastra` are consumed by the CopilotKit v2 runtime. A range,
 * wildcard, or dist-tag there can resolve a different AG-UI protocol surface than the one MDE
 * certifies, so both must be pinned exactly.
 *
 * Usage: node scripts/check-agui-pin.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_PACKAGES = ["@ag-ui/client", "@ag-ui/mastra"];

// Exact version only. Rejects range operators ("^", "~", ">="), wildcards ("1.x", "*"),
// dist-tags ("latest", "next"), and partial versions ("1", "1.2"). A prerelease or build
// suffix is still an exact pin, so an exact prerelease is accepted.
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const failures = [];

  for (const name of REQUIRED_PACKAGES) {
    const spec = declared[name];
    if (typeof spec !== "string") {
      failures.push(`${name} is not declared in package.json`);
      continue;
    }
    if (!EXACT_VERSION.test(spec)) {
      failures.push(`${name} must be pinned to an exact version, found "${spec}"`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`agui-pin: ${failure}`);
    process.exit(1);
  }
  console.log(`agui-pin: ok (${REQUIRED_PACKAGES.length} exact pins)`);
}

main();
