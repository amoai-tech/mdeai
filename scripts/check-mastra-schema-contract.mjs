#!/usr/bin/env node
/**
 * SAN-1321 — detect Mastra storage schema/version drift.
 *
 * Why this exists
 * ---------------
 * `src/mastra/lib/storage.ts` constructs `PostgresStore` with `disableInit: true`,
 * so the runtime never creates its own tables. Provisioning happens only through
 * `npm run mastra:init` (`scripts/init-mastra-schema.mjs`).
 *
 * That initializer is only as good as the `@mastra/pg` version it runs: on
 * 2026-09-18 the pinned `@mastra/pg@1.1.0-alpha.2` created **8** `public.mastra_*`
 * tables while production had **32**, because the adapter was mis-paired with the
 * installed `@mastra/core@1.35.0`. Nothing failed — a fresh environment would
 * simply have been missing 24 tables.
 *
 * `scripts/mastra-schema-contract.json` records the pairing and table set that
 * reproduce the production schema. This script reports drift between that
 * contract and what is actually installed.
 *
 * Usage
 * -----
 *   node scripts/check-mastra-schema-contract.mjs            # report (exit 0)
 *   node scripts/check-mastra-schema-contract.mjs --strict   # fail on drift
 *
 * Test hooks (used by the unit tests; never needed in CI):
 *   --contract <path|->       alternate contract file, or `-` to read stdin
 *   --installed-pg <ver>     override the detected @mastra/pg version
 *   --installed-core <ver>   override the detected @mastra/core version
 *
 * This is a WARNING gate while SAN-1321 is open, so it cannot red-line `floor`
 * for a pre-existing condition. Flip it to `--strict` as the completion criterion
 * of SAN-1321 (see `check:mastra:schema:strict`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const strict = process.argv.includes("--strict");
const contractArg = argValue("--contract");
/** `--contract -` reads the contract from stdin, so callers need no temp file. */
const fromStdin = contractArg === "-";
const contractPath = fromStdin
  ? null
  : path.resolve(ROOT, contractArg ?? "scripts/mastra-schema-contract.json");
if (contractPath && contractPath !== ROOT && !contractPath.startsWith(ROOT + path.sep)) {
  console.error("mastra-schema-contract: contract path must stay inside project root");
  process.exit(1);
}
const contractLabel = fromStdin ? "stdin" : path.relative(ROOT, contractPath);

/** Every provisioned table lives in Mastra's own namespace. */
const TABLE_NAME = /^mastra_[a-z0-9_]+$/;

function installedVersion(pkg) {
  try {
    const nodeModules = path.join(ROOT, "node_modules");
    // `pkg` is read from the contract file, so resolve it and prove the result is
    // still inside node_modules: a crafted contract must not read arbitrary paths.
    const manifest = path.resolve(nodeModules, ...String(pkg).split("/"), "package.json");
    if (!manifest.startsWith(nodeModules + path.sep)) return null;
    return JSON.parse(fs.readFileSync(manifest, "utf8")).version;
  } catch {
    return null;
  }
}

let contract;
try {
  contract = JSON.parse(fromStdin ? fs.readFileSync(0, "utf8") : fs.readFileSync(contractPath, "utf8"));
} catch (error) {
  console.error(`mastra-schema-contract: cannot read ${contractLabel}: ${error.message}`);
  // An unreadable contract is a gate failure in BOTH modes — never a silent pass.
  process.exit(1);
}

if (contract) {
  const installedPg = argValue("--installed-pg") ?? installedVersion(contract.adapter);
  const installedCore = argValue("--installed-core") ?? installedVersion(contract.core);

  const drift = [];
  if (!installedPg) drift.push(`${contract.adapter} is not installed`);
  else if (installedPg !== contract.adapterVersion) {
    drift.push(`${contract.adapter} installed=${installedPg} contract=${contract.adapterVersion}`);
  }
  if (!installedCore) drift.push(`${contract.core} is not installed`);
  else if (installedCore !== contract.coreVersion) {
    drift.push(`${contract.core} installed=${installedCore} contract=${contract.coreVersion}`);
  }

  const tables = Array.isArray(contract.expectedTables) ? contract.expectedTables : [];
  const duplicates = tables.filter((t, i) => tables.indexOf(t) !== i);
  // Reject names outside the namespace, so a contract cannot be padded or
  // rewritten with plausible-looking tables from another schema.
  const outsideNamespace = tables.filter((t) => typeof t !== "string" || !TABLE_NAME.test(t));

  console.log(`mastra-schema-contract: ${contractLabel}`);
  console.log(`  adapter        ${contract.adapter}@${contract.adapterVersion}  (installed ${installedPg ?? "missing"})`);
  console.log(`  core           ${contract.core}@${contract.coreVersion}  (installed ${installedCore ?? "missing"})`);
  console.log(`  expected tables ${tables.length} public.mastra_* tables`);

  if (duplicates.length) {
    drift.push(`contract lists duplicate table names: ${[...new Set(duplicates)].join(", ")}`);
  }
  if (outsideNamespace.length) {
    drift.push(
      `contract lists ${outsideNamespace.length} name(s) outside the mastra_ namespace: ` +
        [...new Set(outsideNamespace.map(String))].slice(0, 5).join(", "),
    );
  }
  if (!tables.length) drift.push("contract lists no expected tables");

  if (drift.length) {
    console.log("");
    console.log("  DRIFT detected:");
    for (const d of drift) console.log(`    - ${d}`);
    console.log("");
    console.log(
      "  A mis-paired @mastra/pg provisions an incomplete schema, and disableInit: true means" +
        " nothing self-heals at runtime.",
    );
    console.log(
      "  Fix: align the adapter with the contract (see contract _derivation/_maintenance)," +
        " re-run `npm run mastra:init` against a scratch Postgres, then diff the table set.",
    );
    if (strict) {
      console.error("");
      console.error(`mastra-schema-contract: FAIL — ${drift.length} drift finding(s)`);
      process.exitCode = 1;
    } else {
      console.log("");
      console.log("mastra-schema-contract: WARN (SAN-1321 open — not blocking). Run with --strict to fail.");
    }
  } else {
    console.log("");
    console.log("mastra-schema-contract: OK");
  }
}
