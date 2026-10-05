#!/usr/bin/env node
// PostToolUse hook for Edit|Write|MultiEdit.
// Runs `eslint <file>` on a touched .ts/.tsx file under src/ or supabase/functions/.
// Warn-only: prints output to stderr, never blocks. No-op if eslint is not installed.

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { findRepoRoot, toRepoRelative } from "./lib/repo-path.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}

const filePath = payload?.tool_input?.file_path || "";
if (!filePath || !/\.(ts|tsx)$/.test(filePath)) process.exit(0);
if (!/^(src|supabase\/functions)\//.test(toRepoRelative(filePath))) process.exit(0);

const root = findRepoRoot(filePath.replace(/[^/]*$/, "") || ".");
const eslintBin = root && join(root, "node_modules/.bin/eslint");
// A fresh worktree has no node_modules until it is bootstrapped; stay silent instead of noisy.
if (!root || !existsSync(eslintBin)) process.exit(0);

const result = spawnSync(eslintBin, ["--no-warn-ignored", filePath], {
  cwd: root,
  encoding: "utf8",
  timeout: 20_000,
});

if (result.status !== 0) {
  process.stderr.write(`[lint warn] ${filePath}\n`);
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

process.exit(0); // warn-only
