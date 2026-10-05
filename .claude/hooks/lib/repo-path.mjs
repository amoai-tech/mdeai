// Shared path helpers for the Claude Code hooks.
//
// The repository root is found by walking up to the nearest directory that holds both
// `package.json` and `.claude/`, so it is correct for the main checkout and for any worktree
// name or location. Hooks used to hard-code `<...>/mdeai/` and a long-gone `mdeapp/` folder, so
// in a worktree (or after the flatten) their path checks silently matched nothing and every
// guard was off. Never hard-code a machine-specific path here.

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

function isRepoRoot(dir) {
  return existsSync(join(dir, "package.json")) && existsSync(join(dir, ".claude"));
}

/** Nearest ancestor of `start` that is a repository root, or `null`. */
export function findRepoRoot(start) {
  let dir = resolve(start);
  while (true) {
    if (isRepoRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Repository root for the current session: Claude's project dir, else walk up from cwd. */
export function projectRoot() {
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  if (fromEnv && isRepoRoot(resolve(fromEnv))) return resolve(fromEnv);
  return findRepoRoot(process.cwd()) ?? resolve(fromEnv || process.cwd());
}

/** `filePath` relative to its repository root, with forward slashes. */
export function toRepoRelative(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  if (!isAbsolute(normalized)) return normalized.replace(/^\.\//, "");
  const root = findRepoRoot(dirname(normalized));
  if (!root) return normalized.split("/").pop() ?? normalized;
  return relative(root, normalized).replace(/\\/g, "/");
}
