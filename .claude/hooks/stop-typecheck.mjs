#!/usr/bin/env node
// Stop hook. Type-checks the project once per set of TypeScript edits, instead of after every edit.
//
// The old PostToolUse version ran a whole-project `tsc` after each edit (and pointed at a folder
// that no longer exists, so it never ran at all). A whole-project check is the right size for the
// end of a turn: it runs only when .ts/.tsx files under src/ or supabase/functions/ changed AND
// those edits have not already been checked, and it reports only errors in the changed files so
// old unrelated errors never block a turn.
//
// Blocks the stop once (exit 2) so the errors reach the model; a second stop passes
// (`stop_hook_active`). Bypass: MDEAI_SKIP_STOP_TYPECHECK=1.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoot } from "./lib/repo-path.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}
if (payload?.stop_hook_active || process.env.MDEAI_SKIP_STOP_TYPECHECK === "1") process.exit(0);

const root = projectRoot();
const tsc = join(root, "node_modules/.bin/tsc");
if (!existsSync(tsc) || !existsSync(join(root, "tsconfig.json"))) process.exit(0);

function git(args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 10_000 });
  return r.status === 0 ? r.stdout : "";
}

const changed = git(["status", "--porcelain", "-uall"])
  .split("\n")
  .map((line) => line.slice(3).trim().replace(/^.* -> /, ""))
  .filter((f) => /^(src|supabase\/functions)\/.*\.(ts|tsx)$/.test(f));
if (changed.length === 0) process.exit(0);

// Skip when these exact edits were already checked (nothing new since the last run).
const fingerprint = createHash("sha256")
  .update(root)
  .update(git(["diff", "HEAD", "--", ...changed]))
  .update(changed.join("\n"))
  .digest("hex")
  .slice(0, 16);
const marker = join(tmpdir(), `mdeai-stop-typecheck-${fingerprint}`);
if (existsSync(marker)) process.exit(0);

const result = spawnSync(tsc, ["--noEmit", "--pretty", "false"], {
  cwd: root,
  encoding: "utf8",
  timeout: 180_000,
});
writeFileSync(marker, String(Date.now()));
if (result.status === 0) process.exit(0);

const lines = `${result.stdout || ""}${result.stderr || ""}`.split("\n").filter(Boolean);
const relevant = lines.filter((l) => changed.some((f) => l.startsWith(f)));
if (relevant.length === 0) process.exit(0); // errors exist, but none in files changed this session

process.stderr.write(
  `stop-typecheck: ${relevant.length} TypeScript error(s) in files changed this session:\n` +
    relevant.slice(0, 25).map((l) => `  ${l}`).join("\n") +
    `\nFix them or say why they are acceptable. To skip: MDEAI_SKIP_STOP_TYPECHECK=1.\n`,
);
process.exit(2);
